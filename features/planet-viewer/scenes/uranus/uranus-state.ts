import { Body, HelioVector, RotationAxis } from "astronomy-engine";

import { Euler, Vector3 } from "three";

const DEG = Math.PI / 180;
const DAY_MS = 86_400_000;

// Uranus has a retrograde sidereal rotation period of approximately 17.24 hours.
const ROTATION_DEG_PER_DAY = -(360 * 24) / 17.24;

const TEXTURE_OFFSET_DEG = 0;

const AXIAL_TILT_DEG = 97.77;

// A small presentation tilt improves depth perception.
export const URANUS_VIEW_ROTATION = new Euler(
  0.12,
  0,
  -AXIAL_TILT_DEG * DEG,
  "XYZ",
);

const CELESTIAL_NORTH = new Vector3(0, 0, 1);

export const URANUS_SPIN_RAD_PER_MS = (ROTATION_DEG_PER_DAY * DEG) / DAY_MS;

export function getUranusState(date: Date) {
  const position = HelioVector(Body.Uranus, date);

  // Uranus -> Sun
  const sun = new Vector3(-position.x, -position.y, -position.z).normalize();

  const axis = RotationAxis(Body.Uranus, date);

  const north = new Vector3(
    axis.north.x,
    axis.north.y,
    axis.north.z,
  ).normalize();

  const node = new Vector3().crossVectors(CELESTIAL_NORTH, north);

  if (node.lengthSq() < 1e-10) {
    node.set(1, 0, 0);
  } else {
    node.normalize();
  }

  const eastReference = new Vector3().crossVectors(north, node).normalize();

  // Transform the solar direction into the planet coordinate frame.
  // X = reference meridian
  // Y = north
  // -Z = east
  const sunDirection = new Vector3(
    sun.dot(node),
    sun.dot(north),
    -sun.dot(eastReference),
  ).normalize();

  const rotationY = (axis.spin + TEXTURE_OFFSET_DEG) * DEG;

  return {
    sunDirection,
    rotationY,
  };
}
