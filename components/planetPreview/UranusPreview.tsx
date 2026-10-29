"use client";

import {
  useEffect,
  useMemo,
} from "react";

import { useTexture } from "@react-three/drei";

import {
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

import type {
  PlanetSceneProps,
} from "@/components/planets/types";

import UranusAtmosphere from
  "@/components/planets/uranus/UranusAtmosphere";

type SurfaceProps = {
  textureUrl: string;
  segments: number;
};

function UranusSurface({
  textureUrl,
  segments,
}: SurfaceProps) {
  const original = useTexture(textureUrl);

  const map = useMemo(() => {
    const texture = original.clone();

    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.needsUpdate = true;

    return texture;
  }, [original]);

  useEffect(() => {
    return () => map.dispose();
  }, [map]);

  return (
    <mesh scale={[1, 0.977, 1]}>
      <sphereGeometry
        args={[2, segments, segments]}
      />

      <meshStandardMaterial
        map={map}
        color="#dcf8ff"
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

export function UranusLite({
  active,
  animate,
}: PlanetSceneProps) {
  return (
    <>
      <UranusSurface
        textureUrl="/textures/uranus/uranus-lite.webp"
        segments={48}
      />

      <UranusAtmosphere
        active={active}
        animate={animate}
        segments={48}
      />
    </>
  );
}

export default function UranusScene({
  active,
  animate,
}: PlanetSceneProps) {
  return (
    <>
      <UranusSurface
        textureUrl="/textures/uranus/uranus-8k.webp"
        segments={128}
      />

      <UranusAtmosphere
        active={active}
        animate={animate}
        segments={128}
      />
    </>
  );
}