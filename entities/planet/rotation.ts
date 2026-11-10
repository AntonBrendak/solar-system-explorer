import {
  Ecliptic,
  MakeTime,
  RotateVector,
  RotationAxis,
  Rotation_EQD_EQJ,
  SiderealTime,
  Vector,
} from "astronomy-engine";
import { Matrix4, Quaternion, Vector3 } from "three";
import { planetBodies } from "./position.ts";
import type { PlanetId } from "./types";

export type PlanetRotation = {
  quaternion: Quaternion;
  north: Vector3;
  spin: number;
  orientation: Quaternion;
};
const Y = new Vector3(0, 1, 0);

const scratchX = new Vector3();
const scratchZ = new Vector3();
const scratchBasis = new Matrix4();
const scratchSpin = new Quaternion();

function toMap(vector: Vector, target: Vector3) {
  const { x, y, z } = Ecliptic(vector).vec;
  return target.set(x, z, -y).normalize();
}

/** IAU axial rotation in the same true ecliptic-of-date frame as orbital positions. */
export function updatePlanetRotation(
  id: PlanetId,
  date: Date,
  target: PlanetRotation,
): PlanetRotation {
  const time = MakeTime(date);
  const axis = RotationAxis(planetBodies[id], time);
  const ra = (axis.ra * Math.PI) / 12;
  // Earth's Greenwich angle is measured from the equinox of date, not the
  // ill-conditioned intersection of its almost coincident EQJ/EQD equators.
  const reference =
    id === "earth"
      ? RotateVector(Rotation_EQD_EQJ(time), new Vector(1, 0, 0, time))
      : new Vector(-Math.sin(ra), Math.cos(ra), 0, time);
  const x = toMap(reference, scratchX);
  const north = toMap(axis.north, target.north);
  const z = scratchZ.crossVectors(x, north).normalize();
  const degrees = id === "earth" ? SiderealTime(time) * 15 : axis.spin;
  // Preserve complete turns so interpolation works in reverse and at high time rates.
  target.spin =
    ((degrees +
      (id === "earth" ? 360 * Math.round((axis.spin - degrees) / 360) : 0)) *
      Math.PI) /
    180;
  target.orientation.setFromRotationMatrix(scratchBasis.makeBasis(x, north, z));
  target.quaternion
    .copy(target.orientation)
    .multiply(scratchSpin.setFromAxisAngle(Y, target.spin));
  return target;
}

export function getPlanetRotation(id: PlanetId, date: Date): PlanetRotation {
  return updatePlanetRotation(id, date, {
    quaternion: new Quaternion(),
    north: new Vector3(),
    spin: 0,
    orientation: new Quaternion(),
  });
}
