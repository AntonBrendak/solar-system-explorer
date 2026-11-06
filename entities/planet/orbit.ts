
import { planetsById } from "./catalog";
import { getPlanetScenePosition } from "./position";
import type { PlanetId } from "./types";

const MILLISECONDS_PER_DAY = 86_400_000;

export type OrbitPoint = readonly [
  x: number,
  y: number,
  z: number,
];

/**
 * Calculate an orbital trajectory using Astronomy Engine.
 *
 * All positions use the same physical scene scale
 * as getPlanetScenePosition().
 *
 * The trajectory is sampled around the selected date.
 * No artificial circular orbits are generated.
 */
export function getPlanetOrbitPoints(
  id: PlanetId,
  date: Date,
  segments = 256,
): OrbitPoint[] {
  const count = Math.max(
    64,
    Math.min(512, Math.trunc(segments)),
  );

  const orbitalPeriodDays = planetsById[id].orbitDays;

  const centerTime = date.getTime();

  const startTime =
    centerTime -
    (orbitalPeriodDays * MILLISECONDS_PER_DAY) / 2;

  const points: OrbitPoint[] = [];

  for (let i = 0; i <= count; i++) {
    const progress = i / count;

    const timestamp =
      startTime +
      progress *
        orbitalPeriodDays *
        MILLISECONDS_PER_DAY;

    const position = getPlanetScenePosition(
      id,
      new Date(timestamp),
    );

    points.push([
      position.x,
      position.y,
      position.z,
    ]);
  }

  return points;
}
