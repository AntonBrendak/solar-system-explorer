
"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Vector3,
  type Group,
  type DirectionalLight,
} from "three";
import type { PlanetEnvironmentProps } from "@/components/planets/types";

// ============================================
// ASTRONOMICAL CONSTANTS
// ============================================

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const DAY_MS = 86_400_000;

const J2000_MS = Date.UTC(2000, 0, 1, 12);

// IAU System III
const ROTATION_DEG_PER_DAY = 870.536;
const ROTATION_DEG_J2000 = 284.95;

// Jupiter's axial obliquity
const AXIAL_TILT_RAD = 3.13 * DEG;

// Circular-orbit approximation
const EARTH_ORBIT_DAYS = 365.256;
const JUPITER_ORBIT_DAYS = 4332.589;

const JUPITER_ORBIT_AU = 5.203;

const EARTH_LONGITUDE_J2000 =
  100.464 * DEG;

const JUPITER_LONGITUDE_J2000 =
  34.3515 * DEG;

// The Solar System Scope texture is not
// calibrated to the IAU zero meridian.
// This offset can be adjusted later.
const TEXTURE_LONGITUDE_OFFSET_RAD = 0;

// Enable temporarily to observe one
// Jupiter rotation in about 36 seconds.
const DEBUG_ROTATION = false;
const ROTATION_ACCELERATION = DEBUG_ROTATION
  ? 1000
  : 1;

// ============================================
// JUPITER ROTATION BY UTC
// ============================================

function getRotationY(nowMs: number): number {
  const days = (nowMs - J2000_MS) / DAY_MS;

  const longitudeDegrees =
    (
      (
        ROTATION_DEG_J2000 +
        days *
          ROTATION_DEG_PER_DAY *
          ROTATION_ACCELERATION
      ) % 360 + 360
    ) % 360;

  return (
    longitudeDegrees * DEG +
    TEXTURE_LONGITUDE_OFFSET_RAD
  );
}

// ============================================
// APPROXIMATE SUN DIRECTION
// ============================================

// The isolated planet starts with its camera
// at +Z, representing an Earth-facing view.
//
// Approximate circular heliocentric orbits
// establish the Sun-Earth-Jupiter phase angle.
// This is not a full JPL ephemeris.

function setSunDirection(
  nowMs: number,
  out: Vector3
): void {
  const days = (nowMs - J2000_MS) / DAY_MS;

  const earthLongitude =
    EARTH_LONGITUDE_J2000 +
    (days / EARTH_ORBIT_DAYS) * TAU;

  const jupiterLongitude =
    JUPITER_LONGITUDE_J2000 +
    (days / JUPITER_ORBIT_DAYS) * TAU;

  // Heliocentric positions in the orbital plane
  const jx =
    JUPITER_ORBIT_AU *
    Math.cos(jupiterLongitude);

  const jy =
    JUPITER_ORBIT_AU *
    Math.sin(jupiterLongitude);

  const ex = Math.cos(earthLongitude);
  const ey = Math.sin(earthLongitude);

  // Vectors originating at Jupiter
  const toEarthX = ex - jx;
  const toEarthY = ey - jy;

  const toSunX = -jx;
  const toSunY = -jy;

  const dot =
    toEarthX * toSunX +
    toEarthY * toSunY;

  const cross =
    toEarthX * toSunY -
    toEarthY * toSunX;

  const phaseAngle = Math.atan2(
    cross,
    dot
  );

  // +Z is the initial observer-facing direction.
  out.set(
    Math.sin(phaseAngle),
    0,
    Math.cos(phaseAngle)
  ).normalize();
}

// ============================================
// COMPONENT
// ============================================

export default function JupiterEnvironment({
  active,
  children,
  lighting,
}: PlanetEnvironmentProps) {
  const bodyRef = useRef<Group>(null);

  const sunlightRef =
    useRef<DirectionalLight>(null);

  const sunDirectionRef = useRef(
    new Vector3(0.12, 0, 1)
  );

  // Runs before the atmosphere animation.
  useFrame(() => {
    if (!active || lighting !== "scene") {
      return;
    }

    const now = Date.now();

    // Rotate the entire planet, including
    // its moving cloud bands and vortices.
    if (bodyRef.current) {
      bodyRef.current.rotation.y =
        getRotationY(now);
    }

    // Update lighting in world coordinates.
    // The light does not rotate with Jupiter.
    setSunDirection(
      now,
      sunDirectionRef.current
    );

    if (sunlightRef.current) {
      sunlightRef.current.position
        .copy(sunDirectionRef.current)
        .multiplyScalar(20);
    }
  }, -1);

  return (
    <>
      {lighting === "scene" && (
        <>
          {/* Very weak ambient illumination */}
          <ambientLight intensity={0.09} />

          {/* Sun: single directional source */}
          <directionalLight
            ref={sunlightRef}
            position={[2, 0, 20]}
            intensity={2.8}
            color="#fff9f1"
          />
        </>
      )}

      {/* Approximate axial tilt */}
      <group
        rotation={[0, 0, AXIAL_TILT_RAD]}
      >
        {/* UTC rotation */}
        <group ref={bodyRef}>
          {children}
        </group>
      </group>
    </>
  );
}
