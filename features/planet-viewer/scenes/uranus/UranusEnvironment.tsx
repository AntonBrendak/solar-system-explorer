"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";

import { useFrame, useThree } from "@react-three/fiber";

import { Group, Vector3, type DirectionalLight } from "three";

import type { PlanetEnvironmentProps } from "../../model/types";

import {
  getUranusState,
  URANUS_SPIN_RAD_PER_MS,
  URANUS_VIEW_ROTATION,
} from "./uranus-state";

const UPDATE_INTERVAL_MS = 60_000;
const SUN_DISTANCE = 20;

const UranusSunContext = createContext<Vector3 | null>(null);

export function useUranusSun() {
  const value = useContext(UranusSunContext);

  if (!value) {
    throw new Error("useUranusSun must be used inside UranusEnvironment");
  }

  return value;
}

export default function UranusEnvironment({
  active,
  animate,
  children,
  lighting,
}: PlanetEnvironmentProps) {
  const spinRef = useRef<Group>(null);
  const sunlightRef = useRef<DirectionalLight>(null);

  const invalidate = useThree((state) => state.invalidate);

  const initialState = useMemo(() => {
    const now = new Date();

    return {
      ...getUranusState(now),
      timestamp: now.getTime(),
    };
  }, []);

  // Expose the world-space solar direction so atmosphere shaders can use world-space normals.
  const sharedWorldSunDirection = useMemo(() => {
    return initialState.sunDirection
      .clone()
      .applyEuler(URANUS_VIEW_ROTATION)
      .normalize();
  }, [initialState]);

  const rotationSample = useRef({
    timestamp: initialState.timestamp,
    angle: initialState.rotationY,
  });

  useEffect(() => {
    if (!active) return;

    const update = () => {
      const now = new Date();
      const state = getUranusState(now);

      rotationSample.current.timestamp = now.getTime();

      rotationSample.current.angle = state.rotationY;

      sharedWorldSunDirection
        .copy(state.sunDirection)
        .applyEuler(URANUS_VIEW_ROTATION)
        .normalize();

      if (sunlightRef.current) {
        sunlightRef.current.position
          .copy(sharedWorldSunDirection)
          .multiplyScalar(SUN_DISTANCE);
      }

      invalidate();
    };

    update();

    const interval = window.setInterval(update, UPDATE_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [active, invalidate, sharedWorldSunDirection]);

  useFrame(() => {
    if (!active || !animate || !spinRef.current) {
      return;
    }

    const now = Date.now();
    const sample = rotationSample.current;
    const elapsedMs = Math.max(0, now - sample.timestamp);

    spinRef.current.rotation.y =
      sample.angle + elapsedMs * URANUS_SPIN_RAD_PER_MS;
  }, -1);

  return (
    <UranusSunContext.Provider value={sharedWorldSunDirection}>
      {lighting === "scene" && (
        <>
          <ambientLight intensity={0.22} />

          <directionalLight
            ref={sunlightRef}
            position={[
              sharedWorldSunDirection.x * SUN_DISTANCE,
              sharedWorldSunDirection.y * SUN_DISTANCE,
              sharedWorldSunDirection.z * SUN_DISTANCE,
            ]}
            intensity={2.1}
            color="#f5fbff"
          />
        </>
      )}

      <group
        rotation={[
          URANUS_VIEW_ROTATION.x,
          URANUS_VIEW_ROTATION.y,
          URANUS_VIEW_ROTATION.z,
        ]}
      >
        <group ref={spinRef} rotation={[0, initialState.rotationY, 0]}>
          {children}
        </group>
      </group>
    </UranusSunContext.Provider>
  );
}
