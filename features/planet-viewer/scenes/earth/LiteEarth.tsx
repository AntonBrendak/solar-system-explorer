"use client";

import { useSceneTexture } from "../../model/useSceneTexture";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { type Group } from "three";
import { earthTextures } from "./textures";
import { getEarthRotationY } from "./earth-time";
import type { PlanetSceneProps } from "../../model/types";

/** Geometry only: the shared stage supplies lighting, rotation and its Canvas. */
export default function LiteEarth({ active }: PlanetSceneProps) {
  const earthRef = useRef<Group>(null);
  const [surface, clouds] = useSceneTexture([
    earthTextures.previewSurface,
    earthTextures.previewClouds,
  ]);

  useFrame(() => {
    if (active && earthRef.current)
      earthRef.current.rotation.y = getEarthRotationY(new Date(), 0);
  });

  return (
    <group ref={earthRef}>
      <mesh>
        <sphereGeometry args={[2, 48, 32]} />
        <meshStandardMaterial map={surface} roughness={1} metalness={0} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.012, 32, 24]} />
        <meshStandardMaterial
          color="white"
          alphaMap={clouds}
          transparent
          opacity={0.7}
          roughness={1}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
