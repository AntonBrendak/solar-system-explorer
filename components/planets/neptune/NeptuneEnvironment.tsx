
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { useFrame, useThree } from "@react-three/fiber";

import {
  type DirectionalLight,
  type Group,
  Vector3,
} from "three";

import type {
  PlanetEnvironmentProps,
} from "@/components/planets/types";

import {
  getNeptuneState,
  NEPTUNE_SPIN_RAD_PER_MS,
} from "@/lib/neptune-state";

const SUN_DISTANCE = 20;
const UPDATE_INTERVAL = 60_000;

const NeptuneSunContext =
  createContext<Vector3 | null>(null);

export function useNeptuneSun() {
  const direction = useContext(NeptuneSunContext);

  if (!direction) {
    throw new Error(
      "NeptuneSunContext is missing"
    );
  }

  return direction;
}

export default function NeptuneEnvironment({
  active,
  animate,
  lighting,
  children,
}: PlanetEnvironmentProps) {
  const orientationRef = useRef<Group>(null);
  const spinRef = useRef<Group>(null);
  const sunlightRef = useRef<DirectionalLight>(null);

  const invalidate = useThree(
    (state) => state.invalidate
  );

  const initial = useMemo(() => {
    const date = new Date();

    return {
      ...getNeptuneState(date),
      timestamp: date.getTime(),
    };
  }, []);

  const sunDirection = useMemo(
    () => initial.sunDirection.clone(),
    [initial]
  );

  const sampleRef = useRef({
    timestamp: initial.timestamp,
    angle: initial.rotationY,
  });

  useEffect(() => {
    if (!active) return;

    const update = () => {
      const now = new Date();
      const state = getNeptuneState(now);

      sampleRef.current = {
        timestamp: now.getTime(),
        angle: state.rotationY,
      };

      sunDirection.copy(state.sunDirection);

      if (orientationRef.current) {
        orientationRef.current.quaternion.copy(
          state.orientation
        );
      }

      if (sunlightRef.current) {
        sunlightRef.current.position
          .copy(sunDirection)
          .multiplyScalar(SUN_DISTANCE);
      }

      invalidate();
    };

    update();

    const interval = window.setInterval(
      update,
      UPDATE_INTERVAL
    );

    return () => window.clearInterval(interval);
  }, [active, invalidate, sunDirection]);

  useFrame(() => {
    if (!active || !animate || !spinRef.current) {
      return;
    }

    const sample = sampleRef.current;

    spinRef.current.rotation.y =
      sample.angle +
      Math.max(0, Date.now() - sample.timestamp) *
        NEPTUNE_SPIN_RAD_PER_MS;
  }, -1);

  return (
    <NeptuneSunContext.Provider value={sunDirection}>
      {lighting === "scene" && (
        <>
          <ambientLight intensity={0.18} />

          <directionalLight
            ref={sunlightRef}
            position={[
              initial.sunDirection.x * SUN_DISTANCE,
              initial.sunDirection.y * SUN_DISTANCE,
              initial.sunDirection.z * SUN_DISTANCE,
            ]}
            intensity={2.5}
            color="#fffaf5"
          />
        </>
      )}

      <group
        ref={orientationRef}
        quaternion={initial.orientation}
      >
        <group
          ref={spinRef}
          rotation={[0, initial.rotationY, 0]}
        >
          {children}
        </group>
      </group>
    </NeptuneSunContext.Provider>
  );
}
