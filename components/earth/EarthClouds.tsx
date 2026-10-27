"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import type { Mesh } from "three";

export default function EarthClouds() {
  const cloudsRef = useRef<Mesh>(null);

  const cloudsTexture = useTexture("/textures/earth/earthClouds.jpg");

  useFrame((_, delta) => {
    if (!cloudsRef.current) return;

    cloudsRef.current.rotation.y += delta * 0.082;
  });

  return (
    <mesh ref={cloudsRef}>
      <sphereGeometry args={[2.02, 64, 64]} />

      <meshStandardMaterial
        color="white"
        alphaMap={cloudsTexture}
        transparent
        opacity={0.85}
        roughness={1}
        metalness={0}
        depthWrite={false}
      />
    </mesh>
  );
}