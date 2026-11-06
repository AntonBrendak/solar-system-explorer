
"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ACESFilmicToneMapping } from "three";

import { SolarSystemLoader } from "./SolarSystemLoader";
import { SolarPhoenix } from "./sun/SolarPhoenix";
import { SunBloom } from "./sun/SunBloom";
import { StarSphere } from "./sky/StarSphere";
import { StarTileManager } from "./sky/StarTileManager";
import { SolarSystemBodies } from "./SolarSystemBodies";

type SkyState = {
  uploaded: number;
  total: number;
  ready: boolean;
  error: string | null;
};

export function SolarSystemExperience() {
  const [sky, setSky] = useState<SkyState>({
    uploaded: 0,
    total: 0,
    ready: false,
    error: null,
  });
  const [simulationDate] = useState(() => new Date());
  
  const [sunReady, setSunReady] =
    useState(false);

  const [showLoader, setShowLoader] =
    useState(true);

  const handleSkyProgress = useCallback(
    (uploaded: number, total: number) => {
      setSky((previous) =>
        previous.uploaded === uploaded &&
        previous.total === total
          ? previous
          : { ...previous, uploaded, total },
      );
    },
    [],
  );

  const handleSkyReady = useCallback(() => {
    setSky((previous) =>
      previous.ready
        ? previous
        : { ...previous, ready: true },
    );
  }, []);

  const handleSkyError = useCallback(
    (error: Error) => {
      setSky((previous) => ({
        ...previous,
        error: error.message,
      }));
    },
    [],
  );
  
  const handleSunReady = useCallback(() => {
    setSunReady(true);
  }, []);

  const sceneReady =
    sunReady && (sky.ready || sky.error !== null);

  const progress =
    sky.total > 0
      ? Math.round(
          ((sky.uploaded + Number(sunReady)) /
            (sky.total + 1)) * 100,
        )
      : null;

  useEffect(() => {
    if (!sceneReady) return;

    const timer = window.setTimeout(() => {
      setShowLoader(false);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [sceneReady]);

  return (
    <main
      data-sky-ready={sky.ready}
      data-sun-ready={sunReady}
      data-scene-ready={sceneReady}
      data-sky-progress={`${sky.uploaded}/${sky.total}`}
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        minHeight: 520,
        overflow: "hidden",
        background: "#060a11",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
        }}
      >
        <Canvas
          camera={{
            position: [0, 0, 6.2],
            fov: 48,
            near: 0.01,
            far: 100000,
          }}
          dpr={[1, 1.5]}
          frameloop="always"
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.9;
          }}
        >
          <Suspense fallback={null}>
            <StarSphere />

            <StarTileManager
              onInitialProgress={handleSkyProgress}
              onInitialReady={handleSkyReady}
              onInitialError={handleSkyError}
              maxActiveTiles={12}
            />

            <SolarPhoenix
              onReady={handleSunReady}
            />
            <SolarSystemBodies
              date={simulationDate}
              showOrbits={true}
              showLabels={false}
            />
            <SunBloom />

            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.06}
              enablePan={false}
              minDistance={2.7}
              maxDistance={30000}
              rotateSpeed={0.55}
              zoomSpeed={0.75}
            />
          </Suspense>
        </Canvas>
      </div>

      {showLoader && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            opacity: sceneReady ? 0 : 1,
            pointerEvents: sceneReady
              ? "none"
              : "auto",
            transition: "opacity 650ms ease",
          }}
        >
          <SolarSystemLoader
            progress={progress}
          />
        </div>
      )}

      {sky.error && sceneReady && (
        <div
          role="status"
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 3,
            maxWidth: "90%",
            padding: "9px 14px",
            borderRadius: 8,
            background: "#321c20",
            color: "#ffe1df",
            fontSize: 13,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          Some high-resolution star tiles could not be loaded.
          Showing the base sky.
        </div>
      )}
    </main>
  );
}
