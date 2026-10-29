
"use client";

import { useEffect, useMemo } from "react";

import { useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";

import {
  BufferAttribute,
  ClampToEdgeWrapping,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from "three";

import {
  useSaturnSun,
} from "@/components/planets/saturn/SaturnEnvironment";

import {
  patchSaturnRings,
  patchSaturnSurface,
} from "@/components/planets/saturn/saturn-shaders";

import {
  SATURN_VIEW_ROTATION,
} from "@/lib/saturn-sun";

// ==========================================
// SATURN DIMENSIONS
// ==========================================

const PLANET_RADIUS = 2;

// Polar flattening.
const POLAR_RATIO = 0.902;

// Main rings relative to the planet radius.
const RING_INNER = 2 * 1.24;
const RING_OUTER = 2 * 2.27;

// ==========================================
// RADIAL RING GEOMETRY
// ==========================================

function createRadialRing(segments: number) {
  const geometry = new RingGeometry(
    RING_INNER,
    RING_OUTER,
    segments,
    1
  );

  // Place rings in Saturn's equatorial XZ plane.
  geometry.rotateX(-Math.PI / 2);

  const positions =
    geometry.getAttribute("position") as BufferAttribute;

  const uvs =
    geometry.getAttribute("uv") as BufferAttribute;

  for (let i = 0; i < positions.count; i++) {
    const radius = Math.hypot(
      positions.getX(i),
      positions.getZ(i)
    );

    // Horizontal texture axis = ring radius.
    const radialU =
      (radius - RING_INNER) /
      (RING_OUTER - RING_INNER);

    uvs.setXY(i, radialU, 0.5);
  }

  uvs.needsUpdate = true;

  return geometry;
}

// ==========================================
// SATURN MODEL
// ==========================================

function SaturnModel({
  detailed,
}: {
  detailed: boolean;
}) {
  const sun = useSaturnSun();
  const { size } = useThree();

  // Lite and Full textures.
  const [surfaceOriginal, ringOriginal] =
    useTexture(
      detailed
        ? [
            "/textures/saturn/saturnMap.jpg",
            "/textures/saturn/saturn-ring.png",
          ]
        : [
            "/textures/saturn/saturn-lite.webp",
            "/textures/saturn/saturn-ring-lite.png",
          ]
    );

  // ========================================
  // TEXTURES
  // ========================================

  const textures = useMemo(() => {
    const surface = surfaceOriginal.clone();
    const rings = ringOriginal.clone();

    surface.colorSpace = SRGBColorSpace;
    surface.wrapS = RepeatWrapping;
    surface.needsUpdate = true;

    rings.colorSpace = SRGBColorSpace;
    rings.wrapS = ClampToEdgeWrapping;
    rings.wrapT = ClampToEdgeWrapping;

    rings.minFilter =
      LinearMipmapLinearFilter;

    rings.magFilter = LinearFilter;
    rings.anisotropy = 8;
    rings.needsUpdate = true;

    return {
      surface,
      rings,
    };
  }, [surfaceOriginal, ringOriginal]);

  // ========================================
  // GEOMETRY
  // ========================================

  const geometry = useMemo(() => {
    const sphere = new SphereGeometry(
      PLANET_RADIUS,
      detailed ? 128 : 48,
      detailed ? 96 : 32
    );

    // Saturn is flattened at its poles.
    sphere.scale(1, POLAR_RATIO, 1);

    return {
      sphere,
      rings: createRadialRing(
        detailed ? 384 : 128
      ),
    };
  }, [detailed]);

  // Dispose only resources owned by this model.
  useEffect(() => {
    return () => {
      textures.surface.dispose();
      textures.rings.dispose();

      geometry.sphere.dispose();
      geometry.rings.dispose();
    };
  }, [textures, geometry]);

  // ========================================
  // RESPONSIVE SCALE
  // ========================================

  const aspect =
    size.width / Math.max(size.height, 1);

  const halfAngle = Math.atan(
    Math.tan((45 * Math.PI) / 360) *
      Math.min(aspect, 1)
  );

  const modelScale = Math.min(
    0.5,
    (6 * Math.sin(halfAngle) * 0.96) /
      RING_OUTER
  );

  // ========================================
  // RENDER
  // ========================================

  return (
    <group
      rotation={SATURN_VIEW_ROTATION}
      scale={modelScale}
    >
      {/* SATURN PLANET */}
      <mesh geometry={geometry.sphere}>
        <meshStandardMaterial
          map={textures.surface}
          roughness={1}
          metalness={0}
          customProgramCacheKey={() =>
            "saturn-surface-ring-shadow-v1"
          }
          onBeforeCompile={(shader) =>
            patchSaturnSurface(
              shader,
              sun,
              textures.rings
            )
          }
        />
      </mesh>

      {/* SATURN RINGS */}
      <mesh
        geometry={geometry.rings}
        renderOrder={1}
      >
        <meshStandardMaterial
          map={textures.rings}
          roughness={1}
          metalness={0}
          side={DoubleSide}
          transparent
          depthWrite={false}
          depthTest
          alphaTest={0.005}
          customProgramCacheKey={() =>
            "saturn-rings-planet-shadow-v1"
          }
          onBeforeCompile={(shader) =>
            patchSaturnRings(shader, sun)
          }
        />
      </mesh>
    </group>
  );
}

// ==========================================
// LITE
// ==========================================

export function SaturnLite() {
  return <SaturnModel detailed={false} />;
}

// ==========================================
// FULL
// ==========================================

export default function SaturnScene() {
  return <SaturnModel detailed />;
}
