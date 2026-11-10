"use client";

import { useSceneTexture } from "../../model/useSceneTexture";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { type Mesh, type Texture } from "three";
import EarthAtmosphere from "./EarthAtmosphere";
import EarthClouds from "./EarthClouds";
import { createOceanNormalMap } from "./createOceanNormalMap";
import EarthNightLights from "./EarthNightLights";
import EarthLightning from "./EarthLightning";
import { useEarthSun } from "./EarthEnvironment";
import { earthTextures } from "./textures";
import { getEarthRotationY } from "./earth-time";
import type { CloudFrameState } from "./cloud-frame-state";
import type { PlanetSceneProps } from "../../model/types";
import { usePlanetMotion } from "../../model/planet-motion";

/** Full scene content; Canvas, progressive loading and controls belong to PlanetStage. */
export default function EarthScene({ active, animate }: PlanetSceneProps) {
  const motion = usePlanetMotion();
  const sunDirection = useEarthSun();
  const groupRef = useRef<Mesh>(null);
  const waveTextureRef = useRef<Texture | null>(null);
  const cloudFrames = useRef<CloudFrameState | null>(null);
  const [map, roughnessMap, normalMap, clearcoatMap] = useSceneTexture([
    earthTextures.surface,
    earthTextures.roughness,
    earthTextures.normal,
    earthTextures.ocean,
  ]);
  const waveNormalMap = useMemo(() => createOceanNormalMap(), []);

  useEffect(() => {
    waveTextureRef.current = waveNormalMap;
    return () => {
      waveTextureRef.current = null;
      waveNormalMap.dispose();
    };
  }, [waveNormalMap]);

  useFrame((_, delta) => {
    if (!groupRef.current || !active) return;
    groupRef.current.rotation.y = motion ? 0 : getEarthRotationY(new Date(), 0);
    const waveTexture = waveTextureRef.current;
    if (waveTexture && animate) {
      waveTexture.offset.x = (waveTexture.offset.x + delta * 0.016) % 1;
      waveTexture.offset.y = (waveTexture.offset.y + delta * 0.012) % 1;
    }
  });

  return (
    <>
      <mesh ref={groupRef}>
        <sphereGeometry args={[2, 128, 128]} />
        <meshPhysicalMaterial
          map={map}
          roughnessMap={roughnessMap}
          normalMap={normalMap}
          clearcoatMap={clearcoatMap}
          roughness={1}
          metalness={0}
          normalScale={[1, 1]}
          clearcoat={0.35}
          reflectivity={0.3}
          clearcoatNormalMap={waveNormalMap}
          clearcoatNormalScale={[0.2, 0.2]}
          clearcoatRoughness={0.4}
        />
        <EarthNightLights sunDirection={sunDirection} />
        <EarthClouds
          cloudFrames={cloudFrames}
          sunDirection={sunDirection}
          active={active}
          animate={animate}
        />
        <EarthLightning
          sunDirection={sunDirection}
          cloudFrames={cloudFrames}
          active={active}
          animate={animate}
        />
      </mesh>
      <EarthAtmosphere sunDirection={sunDirection} />
    </>
  );
}
