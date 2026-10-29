"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { DeviceProfile } from "./texture-quality";

type Connection = EventTarget & {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
};
type DeviceNavigator = Navigator & {
  deviceMemory?: number;
  connection?: Connection;
};
function subscribe(update: () => void) {
  const connection = (navigator as DeviceNavigator).connection;
  connection?.addEventListener("change", update);
  document.addEventListener("visibilitychange", update);
  window.addEventListener("resize", update);
  return () => {
    connection?.removeEventListener("change", update);
    document.removeEventListener("visibilitychange", update);
    window.removeEventListener("resize", update);
  };
}
function snapshot() {
  const device = navigator as DeviceNavigator;
  return JSON.stringify({
    memory: device.deviceMemory,
    cores: device.hardwareConcurrency ?? 2,
    saveData: device.connection?.saveData ?? false,
    effectiveType: device.connection?.effectiveType,
    downlink: device.connection?.downlink,
    hidden: document.hidden,
    screenWidth: innerWidth,
  });
}
const fallback = JSON.stringify({
  cores: 2,
  saveData: false,
  hidden: false,
  screenWidth: 0,
});
export function useDeviceProfile() {
  const value = useSyncExternalStore(subscribe, snapshot, () => fallback);
  return useMemo(
    () => JSON.parse(value) as DeviceProfile & { screenWidth: number },
    [value],
  );
}
