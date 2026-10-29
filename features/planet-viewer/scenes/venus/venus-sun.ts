import { Body, HelioVector, RotationAxis } from "astronomy-engine";

import { Vector3 } from "three";

const DEG = Math.PI / 180;
const CELESTIAL_NORTH = new Vector3(0, 0, 1);

export function getVenusSunDirection(date: Date): Vector3 {
  // Sun-to-Venus vector in J2000 coordinates.
  const position = HelioVector(Body.Venus, date);

  // Reverse the vector to point from Venus to the Sun.
  const sun = new Vector3(-position.x, -position.y, -position.z).normalize();

  // Use the astronomical rotation axis and prime meridian.
  const axis = RotationAxis(Body.Venus, date);

  const north = new Vector3(
    axis.north.x,
    axis.north.y,
    axis.north.z,
  ).normalize();

  const node = new Vector3().crossVectors(CELESTIAL_NORTH, north).normalize();

  const reference = new Vector3().crossVectors(north, node).normalize();

  const spin = axis.spin * DEG;

  // Project the prime meridian onto the equator.
  const meridian = node
    .clone()
    .multiplyScalar(Math.cos(spin))
    .addScaledVector(reference, Math.sin(spin))
    .normalize();

  const east = new Vector3().crossVectors(north, meridian).normalize();

  // Convert to Three.js sphere coordinates: X = prime meridian, Y = north, -Z = east.
  return new Vector3(
    sun.dot(meridian),
    sun.dot(north),
    -sun.dot(east),
  ).normalize();
}
