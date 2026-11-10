"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { SimulationStore } from "./simulation-store";

export function SimulationClock({
  store,
  onOrbitDate,
}: {
  store: SimulationStore;
  onOrbitDate: (date: Date) => void;
}) {
  const orbit = useRef({
    year: store.getFrame().date.getUTCFullYear(),
    seekId: 0,
    updatedAt: 0,
  });
  useFrame(() => {
    const clock = performance.now();
    store.advance(clock);
    const frame = store.getFrame();
    const year = frame.date.getUTCFullYear();
    // Expensive trajectory geometry is independent of per-frame body positions.
    // Refresh after seeks and epoch changes, at most once every two real seconds while playing.
    if (
      frame.seekId !== orbit.current.seekId ||
      (year !== orbit.current.year && clock - orbit.current.updatedAt >= 2000)
    ) {
      orbit.current = { year, seekId: frame.seekId, updatedAt: clock };
      onOrbitDate(new Date(frame.date));
    }
  }, -3);
  return null;
}
