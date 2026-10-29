"use client";

import { useSceneTexture } from "../../model/useSceneTexture";

import type { Texture } from "three";

import MarsAtmosphere from "./MarsAtmosphere";
import { useMarsState } from "./MarsEnvironment";

type MarsSphereProps = {
  color: Texture;
  normal: Texture;
  height?: Texture;
  segments: number;
};

function MarsSphere({ color, normal, height, segments }: MarsSphereProps) {
  const full = Boolean(height);

  return (
    <mesh>
      <sphereGeometry args={[2, segments, segments]} />

      <meshStandardMaterial
        map={color}
        normalMap={normal}
        normalScale={[0.7, 0.7]}
        displacementMap={height}
        displacementScale={full ? 0.010621 : 0}
        displacementBias={full ? -0.00354 : 0}
        roughness={0.98}
        metalness={0}
      />
    </mesh>
  );
}

export function MarsLite() {
  const { rotationY } = useMarsState();

  const [color, normal] = useSceneTexture([
    "/textures/mars/mars-lite.webp",
    "/textures/mars/mars-normal-lite.png",
  ]);

  return (
    <group rotation={[0, rotationY, 0]}>
      <MarsSphere color={color} normal={normal} segments={48} />
    </group>
  );
}

export default function MarsScene() {
  const { sunDirection, rotationY } = useMarsState();

  const [color, height, normal] = useSceneTexture([
    "/textures/mars/mars-8k.jpg",
    "/textures/mars/mars-height-8k.png",
    "/textures/mars/mars-normal-8k.png",
  ]);

  return (
    <group rotation={[0, rotationY, 0]}>
      <MarsSphere
        color={color}
        height={height}
        normal={normal}
        segments={256}
      />

      <MarsAtmosphere sunDirection={sunDirection} />
    </group>
  );
}
