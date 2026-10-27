"use client";

import { Suspense, useRef, useMemo, useEffect } from "react";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";

import type { Mesh, Texture  } from "three";
import EarthAtmosphere from "@/components/earth/EarthAtmosphere";
import EarthClouds from "@/components/earth/EarthClouds";
import { createOceanNormalMap } from"@/components/earth/createOceanNormalMap";

function Earth() {
    const meshRef = useRef<Mesh>(null);
    const waveTextureRef = useRef<Texture | null>(null);

    const textures = useTexture({
        map: "/textures/earth/earthDayOcean.png",
        roughnessMap: "/textures/earth/earth_roughness.png",
        normalMap: "/textures/earth/earth_normal.png",
        clearcoatMap: "/textures/earth/earth_ocean_mask.png",
    });

    const waveNormalMap = useMemo(
    () => createOceanNormalMap(),
    []
  );

  useEffect(() => {
    waveTextureRef.current = waveNormalMap;

    return () => {
      waveTextureRef.current = null;
      waveNormalMap.dispose();
    };
  }, [waveNormalMap]);


  useFrame((_, delta) => {
    if (!meshRef.current) return;

    meshRef.current.rotation.y += delta * 0.08;
    const waveTexture = waveTextureRef.current;

    if (waveTexture) {
      waveTexture.offset.x =
        (waveTexture.offset.x + delta * 0.006) % 1;

      waveTexture.offset.y =
        (waveTexture.offset.y + delta * 0.002) % 1;
    }
  });



  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[2, 128, 128]} />

      <meshPhysicalMaterial
        {...textures}
        roughness={2.5}
        metalness={0.1}
        normalScale={[1, 1]}
        clearcoat={1}
        clearcoatRoughness={1.5}
      />
    </mesh>
  );
}

export default function EarthPreview() {
  return (
    <div className="h-[650px] w-full bg-[#030712]">
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
        <ambientLight intensity={0.08} />

        <directionalLight
          position={[-5, 2, 5]}
          intensity={3}
        />

        <Suspense fallback={null}>
            <Earth />
            <EarthAtmosphere />
            <EarthClouds />
        </Suspense>

        <OrbitControls
          enablePan={false}
          enableZoom={false}
        />
      </Canvas>
    </div>
  );
}