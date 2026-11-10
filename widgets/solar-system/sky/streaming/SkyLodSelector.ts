import { Frustum, Matrix4, Vector3, type PerspectiveCamera } from "three";
import type {
  DetailLevel,
  LodTransitionGroup,
  NetworkTile,
  PageCore,
  SkyRegion,
  SkyLevel,
} from "../model/sky-types";
import { viewportCoverageBudget } from "./ViewportCoverageBudget.ts";

export function regionKey(region: SkyRegion) {
  return `${region.level}/${region.row}/${region.column}`;
}
export function networkTile(region: SkyRegion): NetworkTile {
  if (region.level === 4)
    throw new Error("Virtual base region is not a network tile");
  return { ...region, level: region.level, id: regionKey(region) };
}
export function describeGroup(region: SkyRegion): LodTransitionGroup {
  const tile = networkTile(region);
  return {
    id: regionKey(region),
    region,
    target: tile.level,
    tiles: [tile],
    pages: [],
    currentCoverage: { kind: "base" },
  };
}

export function appendGroupPages(
  group: LodTransitionGroup,
  core: PageCore,
  deadline = Infinity,
) {
  const divisions = 2048 / core;
  const perTile = divisions ** 2;
  const count = group.tiles.length * perTile;
  while (group.pages.length < count && performance.now() < deadline) {
    const index = group.pages.length;
    const tile = group.tiles[Math.floor(index / perTile)];
    const x = index % divisions,
      y = Math.floor((index % perTile) / divisions);
    group.pages.push({ tile, x, y, core, id: `${tile.id}:${core}:${y}/${x}` });
  }
  return group.pages.length === count;
}
export function transitionGroup(
  region: SkyRegion,
  core: PageCore,
): LodTransitionGroup {
  const group = describeGroup(region);
  appendGroupPages(group, core);
  return group;
}
export function contains(region: SkyRegion, tile: SkyRegion) {
  if (tile.level < region.level) return false;
  const factor = tile.level / region.level;
  return (
    Math.floor(tile.column / factor) === region.column &&
    Math.floor(tile.row / factor) === region.row
  );
}
export function detailRegions(): SkyRegion[] {
  return ([8, 16, 32, 64] as const).flatMap((level) =>
    Array.from({ length: (level * level) / 8 }, (_, index) => ({
      level,
      column: index % (level / 2),
      row: Math.floor(index / (level / 2)),
    })),
  );
}

/** Conservative spherical caps against the actual projection side planes (including camera view offsets).
 * Longitude wrapping and polar caps need no special cancellation rules. Selection runs at 10 Hz. */
export type SkyLodPlan = {
  coverage: SkyLevel;
  refinement: DetailLevel;
  desiredLevel: DetailLevel;
  requirements: { level: DetailLevel; pages: number; peakPages: number }[];
  budget: ReturnType<typeof viewportCoverageBudget>;
};
type PendingPlan = SkyLodPlan & {
  core: PageCore;
  slots: number;
  levelIndex: number;
  row: number;
  column: number;
  groups: Set<string>;
  frustum: Frustum;
  atlas: Matrix4;
  ancestorPages: number;
  forward: Vector3;
  halfAngle: number;
};
export class SkyLodSelector {
  private pendingPlan: PendingPlan | null = null;
  private frustum = new Frustum();
  private atlasToView = new Matrix4();
  private direction = new Vector3();
  private forward = new Vector3();
  private aim = new Vector3();
  private inverse = new Matrix4();
  private aimU = 0;
  private aimV = 0;
  private viewHalfAngle = 0;
  private corner = new Vector3();
  private bounds = new Map<
    string,
    { direction: Vector3; visible: number; guard: number }
  >();
  update(camera: PerspectiveCamera, atlasWorld: Matrix4) {
    camera.updateMatrixWorld();
    this.atlasToView.multiplyMatrices(camera.matrixWorldInverse, atlasWorld);
    this.frustum.setFromProjectionMatrix(camera.projectionMatrix);
    this.forward
      .set(0, 0, -1)
      .applyMatrix4(camera.projectionMatrixInverse)
      .normalize();
    this.viewHalfAngle = 0;
    for (const x of [-1, 1])
      for (const y of [-1, 1]) {
        this.corner
          .set(x, y, -1)
          .applyMatrix4(camera.projectionMatrixInverse)
          .normalize();
        this.viewHalfAngle = Math.max(
          this.viewHalfAngle,
          this.forward.angleTo(this.corner),
        );
      }
    this.aim
      .copy(this.forward)
      .transformDirection(this.inverse.copy(this.atlasToView).invert());
    this.aimU =
      (((Math.atan2(this.aim.z, -this.aim.x) / (2 * Math.PI)) % 1) + 1) % 1;
    this.aimV = Math.acos(Math.max(-1, Math.min(1, this.aim.y))) / Math.PI;
  }
  private cap(region: SkyRegion, guard: boolean, matrix = this.atlasToView) {
    const key = regionKey(region);
    let bounds = this.bounds.get(key);
    if (!bounds) {
      const columns = region.level / 2;
      const rows = columns / 2;
      const phi = ((region.column + 0.5) / columns) * Math.PI * 2;
      const theta = ((region.row + 0.5) / rows) * Math.PI;
      const direction = new Vector3(
        -Math.cos(phi) * Math.sin(theta),
        Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
      );
      const radius = (multiplier: number) => {
        const longitude = (multiplier * 2 * Math.PI) / columns;
        const latitude = (multiplier * Math.PI) / rows;
        const dot = (edge: number) =>
          Math.cos(theta) * Math.cos(edge) +
          Math.sin(theta) * Math.sin(edge) * Math.cos(longitude);
        const minimum = Math.min(
          dot(Math.max(0, theta - latitude)),
          dot(Math.min(Math.PI, theta + latitude)),
        );
        return Math.acos(Math.max(-1, Math.min(1, minimum)));
      };
      bounds = { direction, visible: radius(0.5), guard: radius(0.75) };
      this.bounds.set(key, bounds);
    }
    this.direction.copy(bounds.direction).transformDirection(matrix);
    return guard ? bounds.guard : bounds.visible;
  }
  useful(
    region: SkyRegion,
    guard = true,
    frustum = this.frustum,
    atlas = this.atlasToView,
    forward = this.forward,
    halfAngle = this.viewHalfAngle,
  ) {
    const radius = this.cap(region, guard, atlas);
    if (
      this.direction.dot(forward) <
      Math.cos(Math.min(Math.PI, radius + halfAngle))
    )
      return false;
    if (radius >= Math.PI / 2) return true;
    const allowance = Math.sin(radius);
    return frustum.planes
      .slice(0, 4)
      .every((plane) => plane.normal.dot(this.direction) >= -allowance);
  }
  aimed(region: SkyRegion) {
    const columns = region.level / 2,
      rows = region.level / 4;
    return (
      region.column === Math.floor(this.aimU * columns) &&
      region.row === Math.min(rows - 1, Math.floor(this.aimV * rows))
    );
  }
  priority(region: SkyRegion) {
    this.cap(region, false);
    return this.direction.dot(this.forward) + Number(this.aimed(region)) * 2;
  }
  desiredLevel(
    camera: PerspectiveCamera,
    pixelHeight: number,
    core: PageCore,
    slots: number,
  ): SkyLevel {
    return this.plan(camera, pixelHeight, core, slots)!.coverage;
  }
  plan(
    camera: PerspectiveCamera,
    pixelHeight: number,
    core: PageCore,
    slots: number,
    deadline = Infinity,
  ): SkyLodPlan | null {
    if (
      !this.pendingPlan ||
      this.pendingPlan.core !== core ||
      this.pendingPlan.slots !== slots
    ) {
      if (performance.now() >= deadline) return null;
      const required =
        (2 * Math.PI * pixelHeight) /
        ((camera.getEffectiveFOV() * Math.PI) / 180);
      const desiredLevel =
        ([16, 32, 64] as const).find((level) => level * 1024 >= required) ?? 64;
      const refinement = Math.min(64, desiredLevel * 4) as DetailLevel;
      this.pendingPlan = {
        coverage: 4,
        refinement,
        desiredLevel,
        requirements: [],
        budget: viewportCoverageBudget({
          requirements: [],
          desiredLevel,
          core,
          maxPages: slots,
        }),
        core,
        slots,
        levelIndex: 0,
        row: 0,
        column: 0,
        groups: new Set(),
        frustum: this.frustum.clone(),
        atlas: this.atlasToView.clone(),
        ancestorPages: 0,
        forward: this.forward.clone(),
        halfAngle: this.viewHalfAngle,
      };
    }
    const plan = this.pendingPlan;
    const levels = [8, 16, 32, 64] as const;
    while (plan.levelIndex < levels.length) {
      const level = levels[plan.levelIndex];
      while (plan.row < level / 4) {
        if (performance.now() >= deadline) return null;
        if (
          this.useful(
            { level, row: plan.row, column: plan.column },
            false,
            plan.frustum,
            plan.atlas,
            plan.forward,
            plan.halfAngle,
          )
        ) {
          plan.groups.add(`${plan.row}/${plan.column}`);
        }
        if (++plan.column === level / 2) {
          plan.column = 0;
          plan.row++;
        }
      }
      const pages = plan.groups.size * (2048 / core) ** 2;
      const transitionPeak = (2048 / core) ** 2;
      const peakPages = plan.ancestorPages + pages + transitionPeak;
      plan.requirements.push({ level, pages, peakPages });
      plan.ancestorPages += pages;
      plan.levelIndex++;
      plan.row = 0;
      plan.column = 0;
      plan.groups.clear();
    }
    this.pendingPlan = null;
    const budget = viewportCoverageBudget({
      requirements: plan.requirements,
      desiredLevel: plan.desiredLevel,
      core,
      maxPages: slots,
    });
    return {
      coverage: budget.coverage,
      refinement: plan.refinement,
      desiredLevel: plan.desiredLevel,
      requirements: plan.requirements,
      budget,
    };
  }
}
