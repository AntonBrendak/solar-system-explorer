"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";

import { useThree } from "@react-three/fiber";
import { Vector3, type DirectionalLight } from "three";

import type { PlanetEnvironmentProps } from "../../model/types";

import { getVenusSunDirection } from "./venus-sun";

const VenusSunContext = createContext<Vector3 | null>(null);

export function useVenusSun() {
  const sun = useContext(VenusSunContext);

  if (!sun) {
    throw new Error("VenusScene requires VenusEnvironment.");
  }

  return sun;
}

export default function VenusEnvironment({
  active,
  children,
}: PlanetEnvironmentProps) {
  const sun = useMemo(() => new Vector3(-5, 2, 5).normalize(), []);

  const lightRef = useRef<DirectionalLight>(null);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (!active) return;

    const updateSun = () => {
      const direction = getVenusSunDirection(new Date());

      // Mutate the shared vector because the atmosphere retains its reference.
      sun.copy(direction);

      if (lightRef.current) {
        lightRef.current.position.copy(sun).multiplyScalar(10);
      }

      invalidate();
    };

    updateSun();

    const interval = window.setInterval(updateSun, 60_000);

    return () => window.clearInterval(interval);
  }, [active, sun, invalidate]);

  return (
    <VenusSunContext.Provider value={sun}>
      <ambientLight intensity={0.025} />

      <directionalLight
        ref={lightRef}
        position={[-5, 2, 5]}
        intensity={3}
        color="#fff9f1"
      />

      {children}
    </VenusSunContext.Provider>
  );
}
