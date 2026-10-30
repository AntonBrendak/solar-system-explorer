"use client";

import { Canvas } from "@react-three/fiber";
import { SolarSky } from "../scenes/solar/SolarSky";

export default function SolarSystemCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 0, 0], fov: 68, near: 0.1, far: 300 }}
      gl={{ alpha: false, antialias: false, powerPreference: "low-power" }}
      dpr={[1, 1.5]}
      frameloop="demand"
      fallback={null}
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      <SolarSky />
    </Canvas>
  );
}
