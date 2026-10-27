"use client";

import { Suspense, useEffect, useState } from "react";
import { useTexture } from "@react-three/drei";

const UPDATE_INTERVAL = 5 * 60 * 1000;

function PrecipitationMesh({
  version,
}: {
  version: number;
}) {
  const texture = useTexture(
    `/api/precipitation?v=${version}`
  );

  return (
    <mesh>
      <sphereGeometry args={[2.045, 128, 128]} />

      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.55}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

export default function EarthPrecipitation() {
  const [version, setVersion] =
    useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      setVersion(
        Math.floor(Date.now() / 3_600_000)
      );
    };

    update();

    const interval = setInterval(
      update,
      UPDATE_INTERVAL
    );

    return () => clearInterval(interval);
  }, []);

  if (version === null) return null;

  return (
    <Suspense fallback={null}>
      <PrecipitationMesh version={version} />
    </Suspense>
  );
}