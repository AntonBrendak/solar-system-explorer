import type { Quaternion, Vector3 } from "three";
import type { PlanetId } from "@/entities/planet/types";
import type { CameraMode } from "../camera/camera-store";
import type { CameraPath } from "../camera/camera-geometry";

export type SolarMapFocus = PlanetId | "sun" | null;
export type CameraPose = {
  position: Vector3;
  target: Vector3;
  rotation: Quaternion;
  focus: SolarMapFocus;
  mode: CameraMode;
  anchor?: Vector3;
};
export type CameraFlight = {
  path: CameraPath;
  from: CameraPose;
  to: CameraPose;
  elapsed: number;
  duration: number;
  startScale: number;
  endScale: number;
};
export type CameraRuntime = {
  focus: SolarMapFocus;
  request: number | null;
  flight: CameraFlight | null;
  history: CameraPose[];
  overview: CameraPose | null;
  tracked: { id: PlanetId; position: Vector3 } | null;
  safe: Vector3;
  velocity: Vector3;
  keys: Set<string>;
  moving: boolean;
  viewport: string;
  autoFrame: boolean;
};
