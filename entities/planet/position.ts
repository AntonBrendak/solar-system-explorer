import { Body, Ecliptic, HelioVector } from "astronomy-engine";
import type { PlanetId } from "./types";

const bodies: Record<PlanetId, Body> = {
  mercury: Body.Mercury,
  venus: Body.Venus,
  earth: Body.Earth,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
};
export type PlanetPosition = {
  id: PlanetId;
  distanceAu: number;
  longitude: number;
  latitude: number;
  timestamp: string;
};
/** Geometric heliocentric position, true ecliptic of date; no light-time correction. */
export function getPlanetPosition(id: PlanetId, date: Date): PlanetPosition {
  const vector = HelioVector(bodies[id], date);
  const ecliptic = Ecliptic(vector);
  return {
    id,
    distanceAu: vector.Length(),
    longitude: ecliptic.elon,
    latitude: ecliptic.elat,
    timestamp: date.toISOString(),
  };
}
/**
 * Shared physical scale for the Solar System map.
 * The Sun has a scene radius of 2 units.
 */
export const SOLAR_SCALE = {
  sunRadiusKm: 695_700,
  sunRadiusScene: 2,
  astronomicalUnitKm: 149_597_870.7,
} as const;

/**
 * Convert a physical distance in kilometres
 * to the Solar System scene scale.
 */
export function kmToSceneUnits(km: number): number {
  return (
    (km / SOLAR_SCALE.sunRadiusKm) *
    SOLAR_SCALE.sunRadiusScene
  );
}

export type PlanetScenePosition = {
  id: PlanetId;
  x: number;
  y: number;
  z: number;
  distanceAu: number;
};

/**
 * Convert Astronomy Engine heliocentric coordinates
 * into Three.js coordinates.
 *
 * XZ = ecliptic plane
 * Y  = height above the ecliptic
 *
 * The Sun is located at [0, 0, 0].
 */
export function getPlanetScenePosition(
  id: PlanetId,
  date: Date,
): PlanetScenePosition {
  const position = getPlanetPosition(id, date);

  const longitude =
    (position.longitude * Math.PI) / 180;

  const latitude =
    (position.latitude * Math.PI) / 180;

  const distance = kmToSceneUnits(
    position.distanceAu *
      SOLAR_SCALE.astronomicalUnitKm,
  );

  const planarDistance =
    distance * Math.cos(latitude);

  return {
    id,
    x: planarDistance * Math.cos(longitude),
    y: distance * Math.sin(latitude),
    z: -planarDistance * Math.sin(longitude),
    distanceAu: position.distanceAu,
  };
}