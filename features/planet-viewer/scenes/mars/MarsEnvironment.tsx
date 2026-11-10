"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type DirectionalLight } from "three";

import type { PlanetEnvironmentProps } from "../../model/types";
import { usePlanetMotion } from "../../model/planet-motion";
import { getMarsState } from "./mars-state";

type MarsContextValue = {
  sunDirection: Vector3;
  rotationY: number;
};

const MarsStateContext = createContext<MarsContextValue | null>(null);

export function useMarsState() {
  const value = useContext(MarsStateContext);

  if (!value) {
    throw new Error("MarsScene requires MarsEnvironment.");
  }

  return value;
}

export default function MarsEnvironment({
  active,
  children,
  sunDirection: mapSunDirection,
}: PlanetEnvironmentProps) {
  const motion = usePlanetMotion();
  const lightRef = useRef<DirectionalLight>(null);
  const invalidate = useThree((state) => state.invalidate);

  const sunDirection = useMemo(() => new Vector3(-5, 2, 5).normalize(), []);

  const [rotationY, setRotationY] = useState(0);

  useEffect(() => {
    if (!active || motion) return;

    const update = () => {
      const next = getMarsState(new Date());

      sunDirection.copy(mapSunDirection ?? next.sunDirection);
      setRotationY(next.rotationY);

      if (lightRef.current) {
        lightRef.current.position.copy(sunDirection).multiplyScalar(10);
      }

      invalidate();
    };

    update();

    const interval = window.setInterval(update, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [active, invalidate, sunDirection, mapSunDirection, motion]);

  useFrame(() => {
    if (motion && mapSunDirection) sunDirection.copy(mapSunDirection);
  }, -1);

  return (
    <MarsStateContext.Provider
      value={{ sunDirection, rotationY: motion ? 0 : rotationY }}
    >
      <ambientLight intensity={0.03} />

      <directionalLight
        ref={lightRef}
        position={[-5, 2, 5]}
        intensity={3}
        color="#fff8ee"
      />

      {children}
    </MarsStateContext.Provider>
  );
}
