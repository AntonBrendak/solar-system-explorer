"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { earthTextures } from "@/data/earth-textures";
import {
  cloudVolumeVertex,
  cloudVolumeFragment,
  CLOUD_TOP_RADIUS,
  MAX_CLOUD_FLASHES,
} from "./cloud-volume-shaders";

import {
  SRGBColorSpace,
  TextureLoader,
  DataTexture,
  RedFormat,
  Matrix4,
  Vector3,
  Vector4,
  type Mesh,
  type ShaderMaterial,
  type Texture,
} from "three";
import type { CloudFrameState } from "./cloud-frame-state";

const CLOUD_RADIUS = CLOUD_TOP_RADIUS;
const CLOUD_MAP_URL =
  "https://clouds.matteason.co.uk/images/4096x2048/clouds-alpha.png";
const CLOUD_REFRESH_MS = 30 * 60 * 1000;
const CLOUD_CYCLE_SECONDS = 120;
const TWO_PI = Math.PI * 2;

type CloudFrame = { texture: Texture; version: number };
type CloudFrames = {
  from: CloudFrame;
  to: CloudFrame;
  pending: CloudFrame | null;
  fallback: Texture;
  phase: number;
  reducedMotion: boolean;
};
type CloudUniforms = {
  first: { value: Texture };
  fallback: { value: Texture };
  worldToCloud: { value: Matrix4 };
  sunLocal: { value: Vector3 };
  lightning: { value: Vector4[] };
  next: { value: Texture };
  blend: { value: number };
  phase: { value: number };
  precipitation: { value: Texture };
};

function replaceFrame(
  frames: CloudFrames,
  slot: "from" | "to",
  next: CloudFrame,
  uniforms: CloudUniforms,
) {
  const previous = frames[slot].texture;
  frames[slot] = next;
  if (slot === "from") uniforms.first.value = next.texture;
  else uniforms.next.value = next.texture;

  // The loader cache owns the local fallback; dispose only runtime textures.
  if (
    previous !== frames.fallback &&
    previous !== frames.from.texture &&
    previous !== frames.to.texture &&
    previous !== frames.pending?.texture
  )
    previous.dispose();
}

function sameImage(previous: Uint8Array | null, next: Uint8Array) {
  return (
    previous !== null &&
    previous.length === next.length &&
    previous.every((byte, index) => byte === next[index])
  );
}

/** Publish current render inputs without adding a React re-render per frame. */
function publishFrames(
  output: RefObject<CloudFrameState | null> | undefined,
  frames: CloudFrames,
  uniforms: CloudUniforms,
) {
  if (!output) return;
  if (output.current === null) {
    output.current = {
      from: frames.from.texture,
      to: frames.to.texture,
      blend: uniforms.blend.value,
      phase: uniforms.phase.value,
      lightning: uniforms.lightning.value,
    };
    return;
  }
  const state = output.current;
  state.from = frames.from.texture;
  state.to = frames.to.texture;
  state.blend = uniforms.blend.value;
  state.phase = uniforms.phase.value;
}

export default function EarthClouds({
  cloudFrames,
  sunDirection,
  active = true,
  animate = true,
}: {
  cloudFrames?: RefObject<CloudFrameState | null>;
  sunDirection: Vector3;
  active?: boolean;
  animate?: boolean;
}) {
  const materialRef = useRef<ShaderMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const framesRef = useRef<CloudFrames | null>(null);
  const [cloudTexture, polarCloudTexture] = useLoader(TextureLoader, [
    earthTextures.clouds,
    earthTextures.previewClouds,
  ]);
  const precipitationFallback = useRef(
    new DataTexture(new Uint8Array([0]), 1, 1, RedFormat),
  );

  const uniformsRef = useRef<CloudUniforms>({
    first: { value: cloudTexture },
    fallback: { value: polarCloudTexture },
    worldToCloud: { value: new Matrix4() },
    sunLocal: { value: new Vector3() },
    lightning: {
      value: Array.from({ length: MAX_CLOUD_FLASHES }, () => new Vector4()),
    },
    next: { value: cloudTexture },
    blend: { value: 0 },
    phase: { value: 0 },
    precipitation: { value: cloudTexture },
  });

  const configureMaterial = useCallback(
    (material: ShaderMaterial) => {
      const values = uniformsRef.current;
      if (values.precipitation.value === cloudTexture) {
        precipitationFallback.current.needsUpdate = true;
        values.precipitation.value = precipitationFallback.current;
      }
      material.uniforms = {
        uCloudTexture: values.first,
        uCloudFallback: values.fallback,
        uCloudNext: values.next,
        uCloudBlend: values.blend,
        uCloudPhase: values.phase,
        uPrecipitationMask: values.precipitation,
        uWorldToCloud: values.worldToCloud,
        uSunLocal: values.sunLocal,
        uLightning: values.lightning,
      };
      material.needsUpdate = true;
    },
    [cloudTexture],
  );

  useFrame((_, delta) => {
    const uniforms = uniformsRef.current;
    const frames = framesRef.current;
    const material = materialRef.current;
    if (!active || !frames || !material || document.hidden) return;
    const mesh = meshRef.current;
    if (mesh) {
      mesh.updateWorldMatrix(true, false);
      uniforms.worldToCloud.value.copy(mesh.matrixWorld).invert();
      uniforms.sunLocal.value
        .copy(sunDirection)
        .transformDirection(uniforms.worldToCloud.value);
    }

    if (frames.reducedMotion) {
      const latest =
        frames.pending ??
        (frames.from.version > frames.to.version ? frames.from : frames.to);
      frames.pending = null;
      replaceFrame(frames, "from", latest, uniforms);
      replaceFrame(frames, "to", latest, uniforms);
      uniforms.blend.value = 0;
      uniforms.phase.value = 0;
      frames.phase = 0;
      publishFrames(cloudFrames, frames, uniforms);
      return;
    }

    if (!animate) {
      publishFrames(cloudFrames, frames, uniforms);
      return;
    }

    const nextPhase =
      frames.phase + (Math.min(delta, 0.1) * TWO_PI) / CLOUD_CYCLE_SECONDS;
    const hiddenSlot =
      frames.phase < Math.PI && nextPhase >= Math.PI
        ? "from"
        : nextPhase >= TWO_PI
          ? "to"
          : null;
    if (
      hiddenSlot &&
      frames.pending &&
      frames[hiddenSlot].version <=
        frames[hiddenSlot === "from" ? "to" : "from"].version
    ) {
      const next = frames.pending;
      frames.pending = null;
      replaceFrame(frames, hiddenSlot, next, uniforms);
    }
    frames.phase = nextPhase % TWO_PI;
    uniforms.phase.value = frames.phase;
    uniforms.blend.value = (1 - Math.cos(frames.phase)) / 2;
    publishFrames(cloudFrames, frames, uniforms);
  });

  useEffect(() => {
    const fallback = precipitationFallback.current;
    fallback.needsUpdate = true;
    uniformsRef.current.precipitation.value = fallback;
    let current: Texture | null = null;
    let active = true;
    let busy = false;
    let request: AbortController | null = null;
    const loader = new TextureLoader();
    async function refreshPrecipitation() {
      if (!active || busy || document.hidden) return;
      busy = true;
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      let url: string | null = null;
      try {
        const response = await fetch(
          `/api/precipitation/mask?v=${Math.floor(Date.now() / 3600000)}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(`Precipitation HTTP ${response.status}`);
        url = URL.createObjectURL(await response.blob());
        const texture = await loader.loadAsync(url);
        if (!active) {
          texture.dispose();
          return;
        }
        const previous = current;
        current = texture;
        uniformsRef.current.precipitation.value = texture;
        previous?.dispose();
      } catch {
        if (active)
          console.warn(
            "Precipitation data is unavailable; cloud rendering continues with the last available mask.",
          );
      } finally {
        if (url) URL.revokeObjectURL(url);
        window.clearTimeout(timeout);
        busy = false;
        if (request === controller) request = null;
      }
    }
    void refreshPrecipitation();
    const timer = window.setInterval(
      () => void refreshPrecipitation(),
      10 * 60 * 1000,
    );
    return () => {
      active = false;
      request?.abort();
      window.clearInterval(timer);
      current?.dispose();
      fallback.dispose();
    };
  }, []);

  useEffect(() => {
    const uniforms = uniformsRef.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const initial = { texture: cloudTexture, version: 0 };
    const frames: CloudFrames = {
      from: initial,
      to: initial,
      pending: null,
      fallback: cloudTexture,
      phase: 0,
      reducedMotion: media.matches,
    };
    framesRef.current = frames;
    uniforms.first.value = cloudTexture;
    uniforms.next.value = cloudTexture;
    uniforms.blend.value = 0;
    uniforms.phase.value = 0;
    publishFrames(cloudFrames, frames, uniforms);

    let disposed = false;
    let loading = false;
    let lastAttempt = 0;
    let version = 0;
    let lastImage: Uint8Array | null = null;
    let request: AbortController | null = null;
    const loader = new TextureLoader();

    async function refresh() {
      if (
        disposed ||
        loading ||
        document.hidden ||
        Date.now() - lastAttempt < CLOUD_REFRESH_MS
      )
        return;
      loading = true;
      lastAttempt = Date.now();
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      let objectUrl: string | null = null;
      try {
        const response = await fetch(
          `${CLOUD_MAP_URL}?v=${Math.floor(lastAttempt / CLOUD_REFRESH_MS)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Cloud map HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        const image = new Uint8Array(buffer);
        if (disposed || sameImage(lastImage, image)) return;
        objectUrl = URL.createObjectURL(
          new Blob([buffer], { type: "image/png" }),
        );
        const texture = await loader.loadAsync(objectUrl);
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        frames.pending?.texture.dispose();
        frames.pending = { texture, version: ++version };
        lastImage = image;
      } catch {
        if (!disposed)
          console.warn(
            "Live Cloud Maps is unavailable; retaining the last available cloud maps.",
          );
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        window.clearTimeout(timeout);
        loading = false;
        if (request === controller) request = null;
      }
    }

    const onVisibility = () => {
      void refresh();
    };
    const onMotionChange = () => {
      frames.reducedMotion = media.matches;
    };
    void refresh();
    const interval = window.setInterval(onVisibility, CLOUD_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisibility);
    media.addEventListener("change", onMotionChange);
    return () => {
      disposed = true;
      request?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      media.removeEventListener("change", onMotionChange);
      framesRef.current = null;
      if (cloudFrames) cloudFrames.current = null;
      const textures = new Set([
        frames.from.texture,
        frames.to.texture,
        frames.pending?.texture,
      ]);
      textures.forEach((texture) => {
        if (texture && texture !== cloudTexture) texture.dispose();
      });
      lastImage = null;
    };
  }, [cloudTexture, cloudFrames]);

  return (
    <mesh ref={meshRef} renderOrder={3}>
      <sphereGeometry args={[CLOUD_RADIUS, 128, 128]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={cloudVolumeVertex}
        fragmentShader={cloudVolumeFragment}
        onUpdate={configureMaterial}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}
