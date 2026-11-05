
"use client";

import {
  Suspense,
  useCallback,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";

import { SolarSystemLoader } from "./SolarSystemLoader";
import { StarSphere } from "./sky/StarSphere";
import { StarTileManager } from "./sky/StarTileManager";

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

  const handleSkyProgress = useCallback(
    (uploaded: number, total: number) => {
      setSky((previous) => {
        if (
          previous.uploaded === uploaded &&
          previous.total === total
        ) {
          return previous;
        }

        return {
          ...previous,
          uploaded,
          total,
        };
      });
    },
    [],
  );

  const handleSkyReady = useCallback(() => {
    setSky((previous) => ({
      ...previous,
      ready: true,
    }));
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

  return (
    <main
      data-sky-ready={sky.ready}
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
      {/* The real 3D scene runs behind the loader. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
        }}
      >
        <Canvas
          camera={{
            position: [0, 0, 10],
            fov: 60,
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
        >
          <Suspense fallback={null}>
            <StarSphere />

            <StarTileManager
              onInitialProgress={handleSkyProgress}
              onInitialReady={handleSkyReady}
              onInitialError={handleSkyError}
              maxActiveTiles={12}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* The existing ORBITAL loader remains visible. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
        }}
      >
        <SolarSystemLoader progress={null} />
      </div>

      {sky.error && (
        <div
          role="alert"
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 3,
            maxWidth: "90%",
            padding: "12px 18px",
            borderRadius: 8,
            background: "#321c20",
            color: "#ffe1df",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          { "Failed to load the star field"} : {sky.error}
        </div>
      )}
    </main>
  );
}
