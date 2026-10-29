import { Body, HelioVector, RotationAxis } from "astronomy-engine";

import { Matrix4, Quaternion, Vector3 } from "three";

const DEG = Math.PI / 180;
const DAY_MS = 86_400_000;

const CELESTIAL_NORTH = new Vector3(0, 0, 1);

// IAU prime-meridian rotation approximation, degrees/day.
const NEPTUNE_ROTATION_DEG_PER_DAY = 536.3128492;

export const NEPTUNE_SPIN_RAD_PER_MS =
  (NEPTUNE_ROTATION_DEG_PER_DAY * DEG) / DAY_MS;

function project(
  vector: Vector3,
  right: Vector3,
  up: Vector3,
  forward: Vector3,
) {
  return new Vector3(vector.dot(right), vector.dot(up), vector.dot(forward));
}

export function getNeptuneState(date: Date) {
  const neptune = HelioVector(Body.Neptune, date);
  const earth = HelioVector(Body.Earth, date);
  const axis = RotationAxis(Body.Neptune, date);

  const toSun = new Vector3(-neptune.x, -neptune.y, -neptune.z).normalize();

  const toEarth = new Vector3(
    earth.x - neptune.x,
    earth.y - neptune.y,
    earth.z - neptune.z,
  ).normalize();

  const north = new Vector3(
    axis.north.x,
    axis.north.y,
    axis.north.z,
  ).normalize();

  // Observer's sky frame: +Z points toward Earth.
  const skyRight = new Vector3().crossVectors(CELESTIAL_NORTH, toEarth);

  if (skyRight.lengthSq() < 1e-10) {
    skyRight.set(1, 0, 0);
  } else {
    skyRight.normalize();
  }

  const skyUp = new Vector3().crossVectors(toEarth, skyRight).normalize();

  // Planet's equatorial reference frame.
  const bodyX = new Vector3().crossVectors(CELESTIAL_NORTH, north);

  if (bodyX.lengthSq() < 1e-10) {
    bodyX.set(1, 0, 0);
  } else {
    bodyX.normalize();
  }

  const bodyZ = new Vector3().crossVectors(bodyX, north).normalize();

  const matrix = new Matrix4().makeBasis(
    project(bodyX, skyRight, skyUp, toEarth),
    project(north, skyRight, skyUp, toEarth),
    project(bodyZ, skyRight, skyUp, toEarth),
  );

  const orientation = new Quaternion().setFromRotationMatrix(matrix);

  const sunDirection = project(toSun, skyRight, skyUp, toEarth).normalize();

  return {
    orientation,
    sunDirection,
    rotationY: axis.spin * DEG,
  };
}
