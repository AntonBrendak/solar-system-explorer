
"use client";

import { useEffect, useState } from "react";
import { geoToSphere } from "@/lib/geo-to-sphere";

type Cyclone = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  intensity: string;
  updatedAt: string;
};

export default function EarthCyclones() {
  const [storms, setStorms] = useState<Cyclone[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const response = await fetch("/api/cyclones");
        if (!response.ok) return;

        const data = await response.json();

        if (mounted) {
          setStorms(data.storms ?? []);
        }
      } catch {
        // Сохраняем предыдущие данные при ошибке
      }
    }

    void load();

    const timer = setInterval(
      () => void load(),
      15 * 60 * 1000
    );

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <group>
      {storms.map((storm) => (
        <mesh
          key={storm.id}
          position={geoToSphere(storm.lat, storm.lon)}
        >
          <sphereGeometry args={[0.03, 16, 16]} />

          <meshBasicMaterial color="#ffae65" />
        </mesh>
      ))}
    </group>
  );
}
