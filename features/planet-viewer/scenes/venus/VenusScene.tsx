"use client";

import { useSceneTexture } from "../../model/useSceneTexture";

import { type Mesh } from "three";
import VenusAtmosphere from "./VenusAtmosphere";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useVenusSun } from "./VenusEnvironment";

const CLOUD_ROTATION_MS = 4.2 * 24 * 60 * 60 * 1000;
const CLOUD_EPOCH_MS = Date.UTC(2000, 0, 1, 12);

type VenusCloudsProps = {
  textureUrl: string;
  segments: number;
};

function VenusClouds({ textureUrl, segments }: VenusCloudsProps) {
  const clouds = useSceneTexture(textureUrl);
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;

    const elapsed = Date.now() - CLOUD_EPOCH_MS;

    const phase =
      ((elapsed % CLOUD_ROTATION_MS) + CLOUD_ROTATION_MS) % CLOUD_ROTATION_MS;

    // Cloud superrotation completes one turn in approximately 4.2 Earth days.
    meshRef.current.rotation.y = -(phase / CLOUD_ROTATION_MS) * Math.PI * 2;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[2, segments, segments]} />

      <meshStandardMaterial
        map={clouds}
        color="#fffaf5"
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

export function VenusLite() {
  return (
    <VenusClouds
      textureUrl="/textures/venus/venus-clouds-lite.webp"
      segments={48}
    />
  );
}

export default function VenusScene() {
  const sunDirection = useVenusSun();

  return (
    <>
      <VenusClouds
        textureUrl="/textures/venus/venus-clouds-4k.jpg"
        segments={128}
      />

      <VenusAtmosphere sunDirection={sunDirection} />
    </>
  );
}
