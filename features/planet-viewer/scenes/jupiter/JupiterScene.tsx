"use client";

import { useSceneTexture } from "../../model/useSceneTexture";

import type { PlanetSceneProps } from "../../model/types";

import JupiterAtmosphere from "./JupiterAtmosphere";

// LITE

export function JupiterLite() {
  const map = useSceneTexture("/textures/jupiter/jupiter-lite.webp");

  return (
    <mesh>
      <sphereGeometry args={[2, 48, 48]} />

      <meshStandardMaterial map={map} roughness={1} metalness={0} />
    </mesh>
  );
}

// FULL 8K

export default function JupiterScene({ active }: PlanetSceneProps) {
  return (
    <JupiterAtmosphere
      textureUrl="/textures/jupiter/jupiterMap.jpg"
      active={active}
    />
  );
}
