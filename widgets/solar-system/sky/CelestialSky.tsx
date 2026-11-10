"use client";

import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { SimulationStore } from "../simulation/simulation-store";

export function CelestialSky({
  simulation,
  children,
}: {
  simulation: SimulationStore;
  children: ReactNode;
}) {
  const root = useRef<Group>(null);
  useFrame(({ camera }) => {
    if (!root.current) return;
    root.current.position.copy(camera.position);
    root.current.quaternion.copy(simulation.getFrame().skyRotation);
    root.current.updateWorldMatrix(true, false);
  }, -0.25);
  return (
    <group ref={root} scale={[1, 1, -1]}>
      {children}
    </group>
  );
}
