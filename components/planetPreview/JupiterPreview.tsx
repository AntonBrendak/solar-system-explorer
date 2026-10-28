
"use client";

import { useTexture } from "@react-three/drei";

import type { PlanetSceneProps } from
  "@/components/planets/types";

import JupiterAtmosphere from
  "@/components/planets/jupiter/JupiterAtmosphere";

// ============================================
// LITE
// ============================================

export function JupiterLite() {
  const map = useTexture(
    "/textures/jupiter/jupiter-lite.webp"
  );

  return (
    <mesh>
      <sphereGeometry args={[2, 48, 48]} />

      <meshStandardMaterial
        map={map}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

// ============================================
// FULL 8K
// ============================================

export default function JupiterScene({
  active,
}: PlanetSceneProps) {
  return (
    <JupiterAtmosphere
      textureUrl="/textures/jupiter/jupiterMap.jpg"
      active={active}
    />
  );
}
