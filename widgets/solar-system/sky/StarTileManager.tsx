"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BackSide,
  ClampToEdgeWrapping,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type Group,
} from "three";

import {
  getStarTileGrid,
  getStarTileUrl,
  type StarTile,
} from "./star-atlas";
import { selectVisibleStarTiles } from "./star-tile-selection";

type TileState = "waiting" | "loading" | "decoded" | "ready" | "failed";

type TileEntry = {
  id: string;
  tile: StarTile;
  status: TileState;
  lastWanted: number;
  texture?: Texture;
  mesh?: Mesh<SphereGeometry, MeshBasicMaterial>;
};

type Runtime = {
  disposed: boolean;
  loader: TextureLoader;
  entries: Map<string, TileEntry>;
  desired: Set<string>;
  initial: Set<string> | null;
  initialReady: boolean;
  firstPreparedFrame: number | null;
  reportedCount: number;
  decoded: TileEntry[];
  inflight: number;
  clock: number;
  lastSelection: number;
};

type Props = {
  /** Called after the initial tiles are uploaded and a subsequent frame renders. */
  onInitialReady?: () => void;
  /** Number of initial tiles uploaded to GPU (not fake percentage). */
  onInitialProgress?: (uploaded: number, total: number) => void;
  /** Report a missing/broken tile instead of silently finishing the loader. */
  onInitialError?: (error: Error) => void;
  maxActiveTiles?: number;
};

const SKY_RADIUS = 499; // Base StarSphere uses 500.
const DATA_SIZE = 2048;
const MAX_INFLIGHT = 3;
const SELECTION_INTERVAL = 0.25;

function tileId(tile: StarTile) {
  return `${tile.level}/${tile.row}/${tile.column}`;
}

function disposeTile(entry: TileEntry, group: Group) {
  if (entry.mesh) {
    group.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entry.mesh.material.dispose();
    entry.mesh = undefined;
  }
  entry.texture?.dispose();
  entry.texture = undefined;
}

function createTileMesh(
  tile: StarTile,
  texture: Texture,
): Mesh<SphereGeometry, MeshBasicMaterial> {
  const { columns, rows } = getStarTileGrid(tile.level);
  const geometry = new SphereGeometry(
    SKY_RADIUS,
    32,
    20,
    (tile.column / columns) * Math.PI * 2,
    (Math.PI * 2) / columns,
    (tile.row / rows) * Math.PI,
    Math.PI / rows,
  );

  // Generator output: 2048 data pixels + 2px gutter on each side.
  // The Three.js sphere UVs cover 0..1 locally; remap to image interior.
  const image = texture.image as { width: number; height: number };
  const gutterX = (image.width - DATA_SIZE) / 2;
  const gutterY = (image.height - DATA_SIZE) / 2;
  if (gutterX < 0 || gutterY < 0) {
    geometry.dispose();
    throw new Error(`Tile dimensions are too small: ${image.width}x${image.height}`);
  }

  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      (gutterX + uv.getX(i) * DATA_SIZE) / image.width,
      (gutterY + uv.getY(i) * DATA_SIZE) / image.height,
    );
  }
  uv.needsUpdate = true;

  const material = new MeshBasicMaterial({
    map: texture,
    side: BackSide,
    depthWrite: false,
    // Protect planets and the Sun from being overdrawn by transparent sky.
    depthTest: true,
    toneMapped: false,
    transparent: true,
    opacity: 0,
  });

  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = -999; // Always after the 8K base at -1000.
  mesh.frustumCulled = false;
  return mesh;
}

/** A sky LOD layer inside the SAME R3F Canvas as StarSphere. */
export function StarTileManager({
  onInitialReady,
  onInitialProgress,
  onInitialError,
  maxActiveTiles = 12,
}: Props) {
  const groupRef = useRef<Group>(null);
  const stateRef = useRef<Runtime | null>(null);
  const { gl, invalidate } = useThree();

  useEffect(() => {
    const runtime: Runtime = {
      disposed: false,
      loader: new TextureLoader(),
      entries: new Map(),
      desired: new Set(),
      initial: null,
      initialReady: false,
      firstPreparedFrame: null,
      reportedCount: -1,
      decoded: [],
      inflight: 0,
      clock: 0,
      lastSelection: -Infinity,
    };
    stateRef.current = runtime;
    const group = groupRef.current;

    return () => {
      runtime.disposed = true;
      if (group) {
        for (const entry of runtime.entries.values()) {
          disposeTile(entry, group);
        }
      }
      runtime.entries.clear();
      runtime.decoded.length = 0;
      if (stateRef.current === runtime) stateRef.current = null;
    };
  }, []);

  useFrame(({ camera, size }, delta) => {
    const runtime = stateRef.current;
    const group = groupRef.current;
    if (!runtime || !group || runtime.disposed) return;
    if (!(camera instanceof PerspectiveCamera)) return;

    group.position.copy(camera.position);
    runtime.clock += Math.min(delta, 0.1);

    // Lock the opening-camera selection until all initial tiles are ready.
    const selectNow =
      runtime.initial === null ||
      (runtime.initialReady &&
        runtime.clock - runtime.lastSelection >= SELECTION_INTERVAL);

    if (selectNow) {
      runtime.lastSelection = runtime.clock;
      const selection = selectVisibleStarTiles(camera, {
        width: size.width,
        height: size.height,
        pixelRatio: gl.getPixelRatio(),
      });
      const tiles = selection.tiles.slice(0, Math.max(1, maxActiveTiles));
      const desired = new Set(tiles.map(tileId));
      runtime.desired = desired;
      if (runtime.initial === null) runtime.initial = new Set(desired);

      for (const tile of tiles) {
        const id = tileId(tile);
        let entry = runtime.entries.get(id);
        if (!entry) {
          entry = { id, tile, status: "waiting", lastWanted: runtime.clock };
          runtime.entries.set(id, entry);
        }
        entry.lastWanted = runtime.clock;
        if (entry.mesh) entry.mesh.visible = true;
      }
      for (const entry of runtime.entries.values()) {
        if (entry.mesh && !desired.has(entry.id)) entry.mesh.visible = false;
        if (entry.status === "waiting" && !desired.has(entry.id)) {
          runtime.entries.delete(entry.id);
        }
      }
    }

    // Limit network concurrency. Old requests may finish, but cannot add
    // unselected meshes to the scene or mark initial loading as complete.
    for (const entry of runtime.entries.values()) {
      if (runtime.inflight >= MAX_INFLIGHT) break;
      if (entry.status !== "waiting" || !runtime.desired.has(entry.id)) continue;
      entry.status = "loading";
      runtime.inflight++;
      runtime.loader.load(
        getStarTileUrl(entry.tile),
        (texture) => {
          runtime.inflight--;
          if (runtime.disposed || !runtime.entries.has(entry.id)) {
            texture.dispose();
            return;
          }
          if (runtime.initialReady && !runtime.desired.has(entry.id)) {
            texture.dispose();
            runtime.entries.delete(entry.id);
            return;
          }
          texture.colorSpace = SRGBColorSpace;
          texture.wrapS = ClampToEdgeWrapping;
          texture.wrapT = ClampToEdgeWrapping;
          // With only a 2px gutter, autogenerated mipmaps can reintroduce seams.
          texture.generateMipmaps = false;
          texture.minFilter = LinearFilter;
          texture.magFilter = LinearFilter;
          texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
          texture.needsUpdate = true;
          entry.texture = texture;
          entry.status = "decoded";
          runtime.decoded.push(entry);
          invalidate();
        },
        undefined,
        () => {
          runtime.inflight--;
          if (runtime.disposed) return;
          entry.status = "failed";
          if (runtime.initial?.has(entry.id)) {
            onInitialError?.(new Error(`Failed to load sky tile: ${entry.id}`));
          }
        },
      );
    }

    // Upload at most one decoded tile per frame to avoid a burst of uploads.
    const upload = runtime.decoded.shift();
    if (upload?.texture && upload.status === "decoded") {
      try {
        gl.initTexture(upload.texture);
        const mesh = createTileMesh(upload.tile, upload.texture);
        mesh.visible = runtime.desired.has(upload.id);
        mesh.material.opacity = runtime.initialReady ? 0 : 1;
        group.add(mesh);
        upload.mesh = mesh;
        upload.status = "ready";
        invalidate();
      } catch (reason) {
        upload.status = "failed";
        upload.texture.dispose();
        upload.texture = undefined;
        if (runtime.initial?.has(upload.id)) {
          onInitialError?.(reason instanceof Error ? reason : new Error(String(reason)));
        }
      }
    }

    // After first presentation, newly arrived tiles blend in over the 8K sky.
    if (runtime.initialReady) {
      const amount = Math.min(1, delta * 4);
      for (const entry of runtime.entries.values()) {
        if (entry.mesh && entry.mesh.visible && entry.mesh.material.opacity < 1) {
          entry.mesh.material.opacity = Math.min(1, entry.mesh.material.opacity + amount);
        }
      }
    }

    // Retain only a small number of already prepared, non-visible tiles.
    const maximumResident = Math.max(1, maxActiveTiles) + 4;
    const ready = [...runtime.entries.values()].filter((entry) => entry.status === "ready");
    if (ready.length > maximumResident) {
      const old = ready
        .filter((entry) => !runtime.desired.has(entry.id))
        .sort((a, b) => a.lastWanted - b.lastWanted);
      for (const entry of old.slice(0, ready.length - maximumResident)) {
        disposeTile(entry, group);
        runtime.entries.delete(entry.id);
      }
    }

    // Initial progress means GPU-uploaded tiles, not downloaded bytes.
    if (!runtime.initialReady && runtime.initial) {
      const total = runtime.initial.size;
      const count = [...runtime.initial].filter(
        (id) => runtime.entries.get(id)?.status === "ready",
      ).length;
      if (count !== runtime.reportedCount) {
        runtime.reportedCount = count;
        onInitialProgress?.(count, total);
      }
      if (count === total) {
        if (runtime.firstPreparedFrame === null) {
          runtime.firstPreparedFrame = gl.info.render.frame;
          invalidate();
        } else if (gl.info.render.frame > runtime.firstPreparedFrame) {
          runtime.initialReady = true;
          onInitialReady?.();
        }
      }
    }
  });

  return <group ref={groupRef} />;
}
