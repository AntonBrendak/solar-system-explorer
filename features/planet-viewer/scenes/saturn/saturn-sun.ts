import { Body, HelioVector, RotationAxis } from "astronomy-engine";
import { Euler, Vector3 } from "three";

/** Fixed presentation orientation. Shared by the model and its directional light. */
export const SATURN_VIEW_ROTATION = new Euler(0.43, 0, -0.18, "XYZ");

const CELESTIAL_NORTH = new Vector3(0, 0, 1);

/**
 * Sun direction in Saturn's equatorial coordinate frame.
 * +Y is the north pole; +Z approximately faces the Earth observer.
 * This uses real heliocentric positions and the IAU pole, but the
 * presentation camera remains an interactive, artistic viewpoint.
 */
export function getSaturnSunDirection(date: Date, target = new Vector3()) {
  const saturn = HelioVector(Body.Saturn, date);
  const earth = HelioVector(Body.Earth, date);
  const axis = RotationAxis(Body.Saturn, date);

  const north = new Vector3(
    axis.north.x,
    axis.north.y,
    axis.north.z,
  ).normalize();

  const toSun = new Vector3(-saturn.x, -saturn.y, -saturn.z).normalize();

  const toEarth = new Vector3(
    earth.x - saturn.x,
    earth.y - saturn.y,
    earth.z - saturn.z,
  ).normalize();

  // Camera-facing meridian: Earth projected into Saturn's equator.
  const forward = toEarth.clone().addScaledVector(north, -toEarth.dot(north));

  if (forward.lengthSq() < 1e-10) {
    forward.crossVectors(CELESTIAL_NORTH, north);
    if (forward.lengthSq() < 1e-10) forward.set(1, 0, 0);
  }
  forward.normalize();

  const east = new Vector3().crossVectors(north, forward).normalize();

  return target
    .set(toSun.dot(east), toSun.dot(north), toSun.dot(forward))
    .normalize();
}
