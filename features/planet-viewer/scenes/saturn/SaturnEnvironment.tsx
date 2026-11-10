"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";

import { useFrame, useThree } from "@react-three/fiber";

import { Quaternion, Vector3, type DirectionalLight } from "three";

import type { PlanetEnvironmentProps } from "../../model/types";
import { usePlanetMotion } from "../../model/planet-motion";

import { getSaturnSunDirection, SATURN_VIEW_ROTATION } from "./saturn-sun";

const UPDATE_MS = 60_000;
const SUN_DISTANCE = 20;

const SaturnSunContext = createContext<Vector3 | null>(null);

export function useSaturnSun() {
  const sun = useContext(SaturnSunContext);

  if (!sun) {
    throw new Error("Saturn scene requires SaturnEnvironment.");
  }

  return sun;
}

export default function SaturnEnvironment({
  active,
  lighting,
  children,
  sunDirection,
}: PlanetEnvironmentProps) {
  const motion = usePlanetMotion();
  const mapInverse = useMemo(() => new Quaternion(), []);
  // Shared by both surface and ring shaders.
  const sun = useMemo(() => getSaturnSunDirection(new Date()), []);
  const inverseView = useMemo(
    () => new Quaternion().setFromEuler(SATURN_VIEW_ROTATION).invert(),
    [],
  );

  const lightRef = useRef<DirectionalLight>(null);

  const invalidate = useThree((state) => state.invalidate);

  const initialWorldSun = useMemo(
    () =>
      sun.clone().applyEuler(SATURN_VIEW_ROTATION).multiplyScalar(SUN_DISTANCE),
    [sun],
  );

  useEffect(() => {
    if (!active || motion) return;

    const update = () => {
      if (sunDirection) {
        // Ring-shadow shaders use Saturn's unrotated local equatorial frame.
        sun.copy(sunDirection).applyQuaternion(inverseView);
      } else getSaturnSunDirection(new Date(), sun);

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

    const timer = window.setInterval(update, UPDATE_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [active, invalidate, sun, sunDirection, inverseView, motion]);

  useFrame(() => {
    if (!motion || !sunDirection) return;
    mapInverse.copy(motion.rotation.quaternion).invert();
    sun.copy(sunDirection).applyQuaternion(mapInverse);
  }, -1);

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
