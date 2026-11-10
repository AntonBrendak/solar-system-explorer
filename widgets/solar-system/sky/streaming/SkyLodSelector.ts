import { Frustum, Matrix4, Vector3, type PerspectiveCamera } from "three";
import type {
  DetailLevel,
  LodTransitionGroup,
  NetworkTile,
  PageCore,
  SkyRegion,
  SkyLevel,
} from "../model/sky-types";

export function regionKey(region: SkyRegion) {
  return `${region.level}/${region.row}/${region.column}`;
}
export function networkTile(region: SkyRegion): NetworkTile {
  if (region.level === 8)
    throw new Error("Virtual base region is not a network tile");
  return { ...region, level: region.level, id: regionKey(region) };
}
export function describeGroup(
  region: SkyRegion,
  restore = false,
): LodTransitionGroup {
  if (!restore && region.level === 64)
    throw new Error("Maximum Sky LOD reached");
  const target = (restore ? region.level : region.level * 2) as DetailLevel;
  const tiles: NetworkTile[] = [];
  if (restore) tiles.push(networkTile(region));
  else
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        tiles.push(
          networkTile({
            level: target,
            column: region.column * 2 + x,
            row: region.row * 2 + y,
          }),
        );
      }
  return {
    id: `${restore ? "restore:" : ""}${regionKey(region)}`,
    region,
    target,
    tiles,
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
export function restoreGroup(
  region: SkyRegion,
  core: PageCore,
): LodTransitionGroup {
  const group = describeGroup(region, true);
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
export function virtualRegions(): SkyRegion[] {
  return Array.from({ length: 8 }, (_, index) => ({
    level: 8,
    column: index % 4,
    row: Math.floor(index / 4),
  }));
}

/** Conservative spherical caps against the actual projection side planes (including camera view offsets).
 * Longitude wrapping and polar caps need no special cancellation rules. Selection runs at 10 Hz. */
export type SkyLodPlan = { coverage: SkyLevel; refinement: DetailLevel };
type PendingPlan = SkyLodPlan & {
  core: PageCore;
  slots: number;
  levelIndex: number;
  row: number;
  column: number;
  groups: Set<string>;
  frustum: Frustum;
  atlas: Matrix4;
};
export class SkyLodSelector {
  private pendingPlan: PendingPlan | null = null;
  private frustum = new Frustum();
  private atlasToView = new Matrix4();
  private direction = new Vector3();
  private forward = new Vector3();
  private bounds = new Map<
    string,
    { direction: Vector3; visible: number; guard: number }
  >();
  update(camera: PerspectiveCamera, atlasWorld: Matrix4) {
    camera.updateMatrixWorld();
    this.atlasToView.multiplyMatrices(camera.matrixWorldInverse, atlasWorld);
    this.frustum.setFromProjectionMatrix(camera.projectionMatrix);
    this.forward.set(0, 0, -1);
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
  ) {
    const radius = this.cap(region, guard, atlas);
    if (radius >= Math.PI / 2) return true;
    const allowance = Math.sin(radius);
    return frustum.planes
      .slice(0, 4)
      .every((plane) => plane.normal.dot(this.direction) >= -allowance);
  }
  priority(region: SkyRegion) {
    this.cap(region, false);
    return this.direction.dot(this.forward);
  }
  desiredLevel(
    camera: PerspectiveCamera,
    pixelHeight: number,
    core: PageCore,
    slots: number,
  ): DetailLevel | 8 {
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
      this.pendingPlan = {
        coverage: 8,
        refinement: required > 32768 ? 64 : required > 16384 ? 32 : 16,
        core,
        slots,
        levelIndex: 0,
        row: 0,
        column: 0,
        groups: new Set(),
        frustum: this.frustum.clone(),
        atlas: this.atlasToView.clone(),
      };
    }
    const plan = this.pendingPlan;
    const levels = [16, 32, 64] as const;
    while (plan.levelIndex < levels.length) {
      const level = levels[plan.levelIndex];
      if (level > plan.refinement) break;
      while (plan.row < level / 4) {
        if (performance.now() >= deadline) return null;
        if (
          this.useful(
            { level, row: plan.row, column: plan.column },
            false,
            plan.frustum,
            plan.atlas,
          )
        ) {
          plan.groups.add(
            `${Math.floor(plan.row / 2)}/${Math.floor(plan.column / 2)}`,
          );
        }
        if (++plan.column === level / 2) {
          plan.column = 0;
          plan.row++;
        }
      }
      const pages = plan.groups.size * 4 * (2048 / core) ** 2;
      const transitionPeak = level === 16 ? 0 : (2048 / core) ** 2 * 4;
      if (pages + transitionPeak > slots) break;
      plan.coverage = level;
      plan.levelIndex++;
      plan.row = 0;
      plan.column = 0;
      plan.groups.clear();
    }
    this.pendingPlan = null;
    return { coverage: plan.coverage, refinement: plan.refinement };
  }
}
