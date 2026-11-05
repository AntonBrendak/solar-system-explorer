
"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  useFrame,
  useLoader,
  useThree,
} from "@react-three/fiber";
import {
  BackSide,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Mesh,
} from "three";

import { STAR_ATLAS } from "./star-atlas";

export function StarSphere() {
  const meshRef = useRef<Mesh>(null);

  const { gl } = useThree();

  // Load and cache the original texture.
  const sourceTexture = useLoader(
    TextureLoader,
    STAR_ATLAS.baseTexture,
  );

  const maxAnisotropy = Math.min(
    4,
    gl.capabilities.getMaxAnisotropy(),
  );

  // Create our own configured texture instance.
  // Do not mutate the object returned by useLoader.
  const texture = useMemo(() => {
    const copy = sourceTexture.clone();

    copy.colorSpace = SRGBColorSpace;
    copy.wrapS = RepeatWrapping;
    copy.generateMipmaps = true;
    copy.minFilter = LinearMipmapLinearFilter;
    copy.anisotropy = maxAnisotropy;
    copy.needsUpdate = true;

    return copy;
  }, [sourceTexture, maxAnisotropy]);

  useEffect(() => {
    // Upload the texture before displaying the scene.
    gl.initTexture(texture);

    return () => {
      // Release this instance's GPU resources.
      texture.dispose();
    };
  }, [gl, texture]);

  // The star sphere follows camera position,
  // but does not rotate with the camera.
  useFrame(({ camera }) => {
    meshRef.current?.position.copy(camera.position);
  });

  return (
    <mesh
      ref={meshRef}
      frustumCulled={false}
      renderOrder={-1000}
    >
      <sphereGeometry args={[500, 64, 48]} />

      <meshBasicMaterial
        map={texture}
        side={BackSide}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}
