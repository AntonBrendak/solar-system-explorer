"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { DirectionalLight } from "three";

import type { PlanetEnvironmentProps } from
  "@/components/planets/types";

import { getMercurySunDirection } from
  "@/lib/mercury-sun";

const UPDATE_MS = 60_000;

export default function MercuryEnvironment({
  active,
  lighting,
  children,
}: PlanetEnvironmentProps) {
  const lightRef = useRef<DirectionalLight>(null);
  const { invalidate } = useThree();

  useEffect(() => {
    if (!active) return;

    const updateSun = () => {
      const light = lightRef.current;
      if (!light) return;

      const direction = getMercurySunDirection(
        new Date()
      );

      light.position
        .copy(direction)
        .multiplyScalar(10);

      // Перерисовываем сцену даже при
      // остановленной декоративной анимации.
      invalidate();
    };

    updateSun();

    const interval = window.setInterval(
      updateSun,
      UPDATE_MS
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [active, invalidate]);

  return (
    <>
      <ambientLight
        intensity={lighting === "studio" ? 0.08 : 0.025}
      />

      <directionalLight
        ref={lightRef}
        position={[5, 2, 5]}
        intensity={3}
        color="#fff9f1"
      />

      {children}
    </>
  );
}