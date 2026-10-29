"use client";

import { createContext, useContext, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type DirectionalLight } from "three";
import { getEarthRotationY, getSunDirection } from "./earth-time";
import type { PlanetEnvironmentProps } from "../../model/types";

const EarthSun = createContext<Vector3 | null>(null);
const AXIS = new Vector3(0, 1, 0);

export function useEarthSun() {
  const sun = useContext(EarthSun);
  if (!sun) throw new Error("Earth scenes require EarthEnvironment.");
  return sun;
}

export default function EarthEnvironment({
  active,
  children,
  lighting,
}: PlanetEnvironmentProps) {
  const sun = useMemo(() => new Vector3(-5, 2, 5).normalize(), []);
  const light = useRef<DirectionalLight>(null);
  useFrame(() => {
    if (!active) return;
    const now = new Date();
    getSunDirection(now, sun).applyAxisAngle(AXIS, getEarthRotationY(now, 0));
    light.current?.position.copy(sun).multiplyScalar(10);
  }, -1);

  return (
    <EarthSun.Provider value={sun}>
      {lighting === "scene" && (
        <>
          <ambientLight intensity={0.07} />
          <directionalLight ref={light} intensity={3} />
        </>
      )}
      {children}
    </EarthSun.Provider>
  );
}
