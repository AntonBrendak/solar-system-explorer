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
