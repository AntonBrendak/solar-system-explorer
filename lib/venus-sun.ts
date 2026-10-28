import {
  Body,
  HelioVector,
  RotationAxis,
} from "astronomy-engine";

import { Vector3 } from "three";

const DEG = Math.PI / 180;
const CELESTIAL_NORTH = new Vector3(0, 0, 1);

export function getVenusSunDirection(
  date: Date
): Vector3 {
  // Солнце → Венера в координатах J2000
  const position = HelioVector(Body.Venus, date);

  // Венера → Солнце
  const sun = new Vector3(
    -position.x,
    -position.y,
    -position.z
  ).normalize();

  // Реальная ось и угол поворота Венеры
  const axis = RotationAxis(Body.Venus, date);

  const north = new Vector3(
    axis.north.x,
    axis.north.y,
    axis.north.z
  ).normalize();

  const node = new Vector3()
    .crossVectors(CELESTIAL_NORTH, north)
    .normalize();

  const reference = new Vector3()
    .crossVectors(north, node)
    .normalize();

  const spin = axis.spin * DEG;

  // Направление нулевого меридиана
  const meridian = node
    .clone()
    .multiplyScalar(Math.cos(spin))
    .addScaledVector(
      reference,
      Math.sin(spin)
    )
    .normalize();

  const east = new Vector3()
    .crossVectors(north, meridian)
    .normalize();

  // Перевод в координаты сферы Three.js:
  // X = 0° долготы
  // Y = север
  // -Z = восток
  return new Vector3(
    sun.dot(meridian),
    sun.dot(north),
    -sun.dot(east)
  ).normalize();
}