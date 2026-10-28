import {
  Body,
  HelioVector,
  RotationAxis,
} from "astronomy-engine";

import { Vector3 } from "three";

const DEG = Math.PI / 180;

// Калибровка соответствия 0° долготы
// исходной текстуре Меркурия.
const TEXTURE_OFFSET_DEG = 0;

const EQUATOR_NORTH = new Vector3(0, 0, 1);
const MERCURY_NORTH = new Vector3(0, 1, 0);

export function getMercurySunDirection(
  date: Date
): Vector3 {
  // Вектор Солнце → Меркурий в системе J2000
  const position = HelioVector(Body.Mercury, date);

  // Нам нужен обратный вектор:
  // Меркурий → Солнце
  const sun = new Vector3(
    -position.x,
    -position.y,
    -position.z
  ).normalize();

  // Ориентация оси и нулевого меридиана Меркурия
  const axis = RotationAxis(Body.Mercury, date);

  const north = new Vector3(
    axis.north.x,
    axis.north.y,
    axis.north.z
  ).normalize();

  // Опорное направление на экваторе Меркурия
  const node = new Vector3()
    .crossVectors(EQUATOR_NORTH, north)
    .normalize();

  const eastReference = new Vector3()
    .crossVectors(north, node)
    .normalize();

  // Реальный угол поворота нулевого меридиана
  const spin = axis.spin * DEG;

  const primeMeridian = node
    .clone()
    .multiplyScalar(Math.cos(spin))
    .addScaledVector(
      eastReference,
      Math.sin(spin)
    )
    .normalize();

  const east = new Vector3()
    .crossVectors(north, primeMeridian)
    .normalize();

  // Перевод из J2000 в локальные координаты
  // стандартной сферы Three.js:
  // X = нулевой меридиан, Y = север, -Z = восток.
  const direction = new Vector3(
    sun.dot(primeMeridian),
    sun.dot(north),
    -sun.dot(east)
  ).normalize();

  return direction.applyAxisAngle(
    MERCURY_NORTH,
    TEXTURE_OFFSET_DEG * DEG
  );
}