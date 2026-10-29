"use client";

import { useEffect, useMemo, useRef } from "react";

import { useFrame, useThree } from "@react-three/fiber";

import { type Group, type DirectionalLight } from "three";

import type { PlanetEnvironmentProps } from "../../model/types";

import { getJupiterState, JUPITER_SPIN_RAD_PER_MS } from "./jupiter-state";

const UPDATE_INTERVAL_MS = 60_000;
const SUN_DISTANCE = 20;

export default function JupiterEnvironment({
  active,
  children,
  lighting,
}: PlanetEnvironmentProps) {
  const bodyRef = useRef<Group>(null);
  const sunlightRef = useRef<DirectionalLight>(null);

  const invalidate = useThree((state) => state.invalidate);

  // Calculate the initial astronomical state
  // before the first rendered frame.
  const initialState = useMemo(() => {
    const now = new Date();

    return {
      ...getJupiterState(now),
      timestamp: now.getTime(),
    };
  }, []);

  const rotationSample = useRef({
    timestamp: initialState.timestamp,
    angle: initialState.rotationY,
  });

  // ASTRONOMICAL UPDATES

  useEffect(() => {
    if (!active || lighting !== "scene") {
      return;
    }

    const update = () => {
      const now = new Date();
      const state = getJupiterState(now);

      // Use the same sample timestamp for
      // the astronomical angle and interpolation.
      rotationSample.current.timestamp = now.getTime();

      rotationSample.current.angle = state.rotationY;

      // Update the real solar direction.
      // The light stays in world coordinates.
      if (sunlightRef.current) {
        sunlightRef.current.position
          .copy(state.sunDirection)
          .multiplyScalar(SUN_DISTANCE);
      }

      if (bodyRef.current) {
        bodyRef.current.rotation.y = state.rotationY;
      }

      // Works even with demand rendering.
      invalidate();
    };

    update();

    const interval = window.setInterval(update, UPDATE_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [active, lighting, invalidate]);

  // CONTINUOUS JUPITER ROTATION

  useFrame(() => {
    if (!active || lighting !== "scene" || !bodyRef.current) {
      return;
    }

    const now = Date.now();
    const sample = rotationSample.current;

    const elapsedMs = Math.max(0, now - sample.timestamp);

    // Smooth System III rotation between
    // precise astronomical updates.
    bodyRef.current.rotation.y =
      sample.angle + elapsedMs * JUPITER_SPIN_RAD_PER_MS;
  }, -1);

  // SCENE

  return (
    <>
      {lighting === "scene" && (
        <>
          <ambientLight intensity={0.09} />

          <directionalLight
            ref={sunlightRef}
            position={[
              initialState.sunDirection.x * SUN_DISTANCE,
              initialState.sunDirection.y * SUN_DISTANCE,
              initialState.sunDirection.z * SUN_DISTANCE,
            ]}
            intensity={2.8}
            color="#fff9f1"
          />
        </>
      )}

      {/* No additional axial tilt:
          it is accounted for in the
          astronomical reference frame. */}
      <group ref={bodyRef} rotation={[0, initialState.rotationY, 0]}>
        {children}
      </group>
    </>
  );
}
