import { Body, HelioVector, RotationAxis } from "astronomy-engine";

import { Vector3 } from "three";

const DEG = Math.PI / 180;

// Calibrate the texture longitude against the prime meridian.
const TEXTURE_OFFSET_DEG = 0;

const EQUATOR_NORTH = new Vector3(0, 0, 1);
const MERCURY_NORTH = new Vector3(0, 1, 0);

export function getMercurySunDirection(date: Date): Vector3 {
  // Sun-to-Mercury vector in J2000 coordinates.
  const position = HelioVector(Body.Mercury, date);

  // Reverse the vector to point from Mercury to the Sun.
  const sun = new Vector3(-position.x, -position.y, -position.z).normalize();

  // Use the astronomical rotation axis and prime meridian.
  const axis = RotationAxis(Body.Mercury, date);

  const north = new Vector3(
    axis.north.x,
    axis.north.y,
    axis.north.z,
  ).normalize();

  // Project a reference direction onto the equator.
  const node = new Vector3().crossVectors(EQUATOR_NORTH, north).normalize();

  const eastReference = new Vector3().crossVectors(north, node).normalize();

  // Apply the astronomical prime-meridian rotation.
  const spin = axis.spin * DEG;

  const primeMeridian = node
    .clone()
    .multiplyScalar(Math.cos(spin))
    .addScaledVector(eastReference, Math.sin(spin))
    .normalize();

  const east = new Vector3().crossVectors(north, primeMeridian).normalize();

  // Convert J2000 to sphere coordinates: X = prime meridian, Y = north, -Z = east.
  const direction = new Vector3(
    sun.dot(primeMeridian),
    sun.dot(north),
    -sun.dot(east),
  ).normalize();

  return direction.applyAxisAngle(MERCURY_NORTH, TEXTURE_OFFSET_DEG * DEG);
}
