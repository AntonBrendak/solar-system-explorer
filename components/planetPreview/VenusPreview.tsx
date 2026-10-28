
"use client";

import { useTexture } from "@react-three/drei";
import { Vector3, type Mesh } from "three";
import VenusAtmosphere from "@/components/planets/venus/VenusAtmosphere";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useVenusSun } from "@/components/planets/venus/VenusEnvironment";

const CLOUD_ROTATION_MS = 4.2 * 24 * 60 * 60 * 1000;
const CLOUD_EPOCH_MS = Date.UTC(2000, 0, 1, 12);

type VenusCloudsProps = {
  textureUrl: string;
  segments: number;
};

function VenusClouds({
  textureUrl,
  segments,
}: VenusCloudsProps) {
  const clouds = useTexture(textureUrl);
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;

    const elapsed = Date.now() - CLOUD_EPOCH_MS;

    const phase =
      ((elapsed % CLOUD_ROTATION_MS) +
        CLOUD_ROTATION_MS) %
      CLOUD_ROTATION_MS;

    // Суперротация облаков Венеры
    // Полный оборот примерно за 4,2 земных суток
    meshRef.current.rotation.y =
      -(phase / CLOUD_ROTATION_MS) * Math.PI * 2;
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

// Lite — для выбора планет
export function VenusLite() {
  return (
    <VenusClouds
      textureUrl="/textures/venus/venus-clouds-lite.webp"
      segments={48}
    />
  );
}

// Full — детальный просмотр
export default function VenusScene() {
  const sunDirection = useVenusSun();

  return (
    <>
      <VenusClouds
        textureUrl="/textures/venus/venus-clouds-4k.jpg"
        segments={128}
      />

      <VenusAtmosphere
        sunDirection={sunDirection}
      />
    </>
  );
}
