import { MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import { cinematicEase } from "./camera-geometry";
import type { CameraPose, CameraFlight } from "../model/types";

const UP = new Vector3(0, 1, 0);

export function orientation(position: Vector3, target: Vector3) {
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(position, target, UP),
  );
}
export function initialPose(): CameraPose {
  const position = new Vector3(0, 850, 1800),
    target = new Vector3();
  return {
    position,
    target,
    rotation: orientation(position, target),
    focus: null,
    mode: "orbit",
  };
}
export function copyPose(pose: CameraPose): CameraPose {
  return {
    ...pose,
    position: pose.position.clone(),
    target: pose.target.clone(),
    rotation: pose.rotation.clone(),
    anchor: pose.anchor?.clone(),
  };
}
export function samePose(a: CameraPose, b: CameraPose) {
  return (
    a.focus === b.focus &&
    a.mode === b.mode &&
    a.position.distanceToSquared(b.position) < 1e-14 &&
    a.target.distanceToSquared(b.target) < 1e-14 &&
    a.rotation.angleTo(b.rotation) < 1e-6
  );
}
/** Logarithmic departure and approach keep physically tiny planets from popping into view at the last frame. */
export function travelProgress(flight: CameraFlight, progress: number) {
  const eased = cinematicEase(progress);
  if (flight.path.length < 1e-9) return eased;
  const a = MathUtils.clamp(flight.startScale / flight.path.length, 1e-7, 0.2);
  const b = MathUtils.clamp(flight.endScale / flight.path.length, 1e-7, 0.2);
  const z = MathUtils.lerp(Math.log(a / (1 - a)), Math.log((1 - b) / b), eased);
  return MathUtils.clamp((1 / (1 + Math.exp(-z)) - a) / (1 - b - a), 0, 1);
}
