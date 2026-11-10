import type { PlanetId } from "@/entities/planet/types";

export type CameraMode = "orbit" | "free";
/** Absolute camera speed, never a multiplier based on distance to a body. */
export const FLIGHT_SPEED_RANGE_KM_S = {
  min: 5000,
  max: 100_000_000,
  initial: 5000,
} as const;
export type CameraCommand =
  { type: "mode"; mode: CameraMode } | { type: "back" } | { type: "reset" };
export type CameraStatus = {
  mode: CameraMode;
  canGoBack: boolean;
  flying: boolean;
  speedKmPerSecond: number;
  distanceTarget: PlanetId | "sun" | null;
  distanceKm: number | null;
};
const INITIAL: CameraStatus = {
  mode: "orbit",
  canGoBack: false,
  flying: false,
  speedKmPerSecond: FLIGHT_SPEED_RANGE_KM_S.initial,
  distanceTarget: null,
  distanceKm: null,
};

/** UI subscribes to status; the render loop reads commands/input without React rerenders. */
export function createCameraStore() {
  let status = INITIAL;
  let commands: CameraCommand[] = [];
  let focusCanvas: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<CameraStatus>) => {
    if (
      Object.entries(patch).every(
        ([key, value]) => status[key as keyof CameraStatus] === value,
      )
    )
      return;
    status = { ...status, ...patch };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => status,
    getServerSnapshot: () => INITIAL,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update,
    command(command: CameraCommand) {
      commands.push(command);
    },
    consumeCommands() {
      const pending = commands;
      commands = [];
      return pending;
    },
    bindCanvasFocus(callback: (() => void) | null) {
      focusCanvas = callback;
    },
    resumeCamera() {
      focusCanvas?.();
    },
    setSpeedKmPerSecond(speed: number) {
      update({
        speedKmPerSecond: Math.max(
          FLIGHT_SPEED_RANGE_KM_S.min,
          Math.min(FLIGHT_SPEED_RANGE_KM_S.max, Math.round(speed)),
        ),
      });
    },
  };
}
export type CameraStore = ReturnType<typeof createCameraStore>;
