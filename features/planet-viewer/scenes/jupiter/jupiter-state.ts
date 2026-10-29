import { Body, HelioVector, RotationAxis } from "astronomy-engine";

import { Vector3 } from "three";

const DEG = Math.PI / 180;
const DAY_MS = 86_400_000;

// IAU System III: Jupiter rotation.
const ROTATION_DEG_PER_DAY = 870.536;

// Texture calibration, if needed.
const TEXTURE_OFFSET_DEG = 0;

const CELESTIAL_NORTH = new Vector3(0, 0, 1);

export const JUPITER_SPIN_RAD_PER_MS = (ROTATION_DEG_PER_DAY * DEG) / DAY_MS;

export function getJupiterState(date: Date) {
  // Heliocentric Jupiter position in J2000.
  const position = HelioVector(Body.Jupiter, date);

  // Jupiter -> Sun.
  const sun = new Vector3(-position.x, -position.y, -position.z).normalize();

  // Jupiter's actual pole and rotation angle.
  const axis = RotationAxis(Body.Jupiter, date);

  const north = new Vector3(
    axis.north.x,
    axis.north.y,
    axis.north.z,
  ).normalize();

  // Equatorial reference for the rotation axis.
  const node = new Vector3().crossVectors(CELESTIAL_NORTH, north);

  if (node.lengthSq() < 1e-10) {
    node.set(1, 0, 0);
  } else {
    node.normalize();
  }

  const eastReference = new Vector3().crossVectors(north, node).normalize();

  // Sun direction in our non-rotating scene.
  // X = reference meridian
  // Y = Jupiter north
  // -Z = east
  const sunDirection = new Vector3(
    sun.dot(node),
    sun.dot(north),
    -sun.dot(eastReference),
  ).normalize();

  // Actual System III rotation at this UTC time.
  const rotationY = (axis.spin + TEXTURE_OFFSET_DEG) * DEG;

  return {
    sunDirection,
    rotationY,
  };
}
