"use client";

import {
  TextureSourceContext,
  useSceneTexture,
} from "../../model/useSceneTexture";

import { useContext, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { type Group } from "three";
import { earthTextures } from "./textures";
import { getEarthRotationY } from "./earth-time";
import type { PlanetSceneProps } from "../../model/types";
import { usePlanetMotion } from "../../model/planet-motion";

/** Geometry only: the shared stage supplies lighting, rotation and its Canvas. */
export default function LiteEarth({ active }: PlanetSceneProps) {
  const motion = usePlanetMotion();
  const earthRef = useRef<Group>(null);
  const sources = useContext(TextureSourceContext);
  const alphaClouds =
    sources?.[earthTextures.previewClouds] === earthTextures.clouds;
  const [surface, clouds] = useSceneTexture([
    earthTextures.previewSurface,
    earthTextures.previewClouds,
  ]);

  useFrame(() => {
    if (active && earthRef.current)
      earthRef.current.rotation.y = motion
        ? 0
        : getEarthRotationY(new Date(), 0);
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
          map={alphaClouds ? clouds : undefined}
          alphaMap={alphaClouds ? undefined : clouds}
          transparent
          opacity={0.45}
          roughness={1}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
