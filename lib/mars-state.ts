import {
  Body,
  HelioVector,
  RotationAxis,
} from "astronomy-engine";

import { Vector3 } from "three";

const DEG = Math.PI / 180;
const CELESTIAL_NORTH = new Vector3(0, 0, 1);

// Если потом увидишь, что текстура повернута не тем местом,
// подберём смещение здесь.
const TEXTURE_OFFSET_DEG = 0;

export function getMarsState(date: Date) {
  // Солнце -> Марс в J2000
  const position = HelioVector(Body.Mars, date);

  // Марс -> Солнце
  const sun = new Vector3(
    -position.x,
    -position.y,
    -position.z,
  ).normalize();

  const axis = RotationAxis(Body.Mars, date);

  const north = new Vector3(
    axis.north.x,
    axis.north.y,
    axis.north.z,
  ).normalize();

  let node = new Vector3().crossVectors(
    CELESTIAL_NORTH,
    north,
  );

  if (node.lengthSq() < 1e-10) {
    node = new Vector3(1, 0, 0);
  } else {
    node.normalize();
  }

  const eastReference = new Vector3()
    .crossVectors(north, node)
    .normalize();

  // Это направление Солнца в "мировых" координатах нашей сцены,
  // без учета собственного вращения текстуры.
  const sunDirection = new Vector3(
    sun.dot(node),
    sun.dot(north),
    -sun.dot(eastReference),
  ).normalize();

  // Реальный угол вращения Марса
  const rotationY =
    (axis.spin + TEXTURE_OFFSET_DEG) * DEG;

  return {
    sunDirection,
    rotationY,
  };
}