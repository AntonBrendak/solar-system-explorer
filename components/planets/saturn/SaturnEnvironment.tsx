
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { useThree } from "@react-three/fiber";

import {
  Vector3,
  type DirectionalLight,
} from "three";

import type {
  PlanetEnvironmentProps,
} from "@/components/planets/types";

import {
  getSaturnSunDirection,
  SATURN_VIEW_ROTATION,
} from "@/lib/saturn-sun";

const UPDATE_MS = 60_000;
const SUN_DISTANCE = 20;

const SaturnSunContext =
  createContext<Vector3 | null>(null);

export function useSaturnSun() {
  const sun = useContext(SaturnSunContext);

  if (!sun) {
    throw new Error(
      "Saturn scene requires SaturnEnvironment."
    );
  }

  return sun;
}

export default function SaturnEnvironment({
  active,
  lighting,
  children,
}: PlanetEnvironmentProps) {
  // Shared by both surface and ring shaders.
  const sun = useMemo(
    () => getSaturnSunDirection(new Date()),
    []
  );

  const lightRef =
    useRef<DirectionalLight>(null);

  const invalidate = useThree(
    (state) => state.invalidate
  );

  const initialWorldSun = useMemo(
    () =>
      sun
        .clone()
        .applyEuler(SATURN_VIEW_ROTATION)
        .multiplyScalar(SUN_DISTANCE),
    [sun]
  );

  useEffect(() => {
    if (!active) return;

    const update = () => {
      getSaturnSunDirection(
        new Date(),
        sun
      );

      const light = lightRef.current;

      if (light) {
        light.position
          .copy(sun)
          .applyEuler(SATURN_VIEW_ROTATION)
          .multiplyScalar(SUN_DISTANCE);
      }

      invalidate();
    };

    update();

    const timer = window.setInterval(
      update,
      UPDATE_MS
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [active, invalidate, sun]);

  return (
    <SaturnSunContext.Provider value={sun}>
      {lighting === "scene" && (
        <>
          <ambientLight intensity={0.08} />

          <directionalLight
            ref={lightRef}
            position={initialWorldSun}
            intensity={2.8}
            color="#fff9f1"
          />
        </>
      )}

      {children}
    </SaturnSunContext.Provider>
  );
}
