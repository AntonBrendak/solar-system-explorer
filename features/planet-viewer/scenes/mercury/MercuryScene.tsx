"use client";

import { useSceneTexture } from "../../model/useSceneTexture";

type MercurySurfaceProps = {
  textureUrl: string;
  displacementMap: string;
  normalMap: string;
  segments: number;
  normalStrength?: number;
};

function MercurySurface({
  textureUrl,
  displacementMap,
  segments,
  normalMap,
  normalStrength = 1,
}: MercurySurfaceProps) {
  const [surface, height, normal] = useSceneTexture([
    textureUrl,
    displacementMap,
    normalMap,
  ]);

  return (
    <mesh>
      <sphereGeometry args={[2, segments, segments]} />

      <meshStandardMaterial
        map={surface}
        normalMap={normal}
        normalScale={[normalStrength, normalStrength]}
        displacementMap={height}
        displacementScale={0.0204}
        displacementBias={-0.0104}
        roughness={0.96}
        metalness={0}
      />
    </mesh>
  );
}

export function MercuryLite() {
  return (
    <MercurySurface
      textureUrl="/textures/mercury/mercury-lite.webp"
      displacementMap="/textures/mercury/mercury-height-lite.png"
      normalMap="/textures/mercury/mercury-normal-lite.png"
      segments={48}
      normalStrength={0.9}
    />
  );
}

export default function MercuryScene() {
  return (
    <MercurySurface
      textureUrl="/textures/mercury/mercuryMap.jpg"
      displacementMap="/textures/mercury/mercury-height-8k.png"
      normalMap="/textures/mercury/mercury-normal-8k.png"
      segments={256}
      normalStrength={0.6}
    />
  );
}
