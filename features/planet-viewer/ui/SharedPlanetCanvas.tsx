"use client";

import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";

import { type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor, View } from "@react-three/drei";
import { useSceneMotion } from "@/shared/lib/useSceneMotion";
import styles from "./planet-canvas.module.css";
import { CachedPlanetView } from "./CachedPlanetView";
import { RendererDiagnostics } from "./RendererDiagnostics";
import type { SceneSlot } from "../model/scene-cache";
import type { QualityPreference } from "../model/texture-quality";
import { residentTextureWidth } from "../model/scene-resources";

// Clear the entire shared buffer before the scissored views render.
function ClearFrame() {
  const { gl } = useThree();
  useFrame(() => {
    gl.setScissorTest(false);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
  }, 0.5);
  return null;
}

function AdaptiveQuality() {
  const setDpr = useThree((state) => state.setDpr);
  return <PerformanceMonitor onDecline={() => setDpr(1)} flipflops={2} />;
}

export default function SharedPlanetCanvas({
  source,
  paused,
  active,
  onAvailable,
  onLayer,
  scenes,
  onSceneBytes,
  preference,
  textureBudget,
  onTextureLimit,
  textureLimit,
  onContextReset,
}: {
  source: RefObject<HTMLDivElement | null>;
  paused: boolean;
  active: boolean;
  onAvailable: (available: boolean) => void;
  onLayer: (layer: HTMLDivElement | null) => void;
  scenes: SceneSlot[];
  onSceneBytes: (id: string, bytes: number) => void;
  preference: QualityPreference;
  textureBudget: number;
  onTextureLimit: (limit: number) => void;
  textureLimit: number;
  onContextReset: () => void;
}) {
  const animate = useSceneMotion(paused, active);
  return (
    <div ref={onLayer} className={styles.canvasHost} aria-hidden="true">
      <ErrorBoundary onError={() => onAvailable(false)}>
        <Canvas
          eventSource={source}
          eventPrefix="client"
          frameloop={animate ? "always" : "demand"}
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true, powerPreference: "default" }}
          fallback={null}
          onCreated={({ gl, invalidate }) => {
            onTextureLimit(gl.capabilities.maxTextureSize);
            gl.domElement.addEventListener("webglcontextlost", (event) => {
              event.preventDefault();
              onAvailable(false);
              onTextureLimit(Math.max(1024, residentTextureWidth() / 2));
              onContextReset();
            });
            gl.domElement.addEventListener("webglcontextrestored", () => {
              onAvailable(true);
              invalidate();
            });
          }}
        >
          <AdaptiveQuality />
          <ClearFrame />
          <RendererDiagnostics
            scenes={scenes}
            textureBudget={textureBudget}
            preference={preference}
          />
          <View.Port />
          {scenes.map((slot) => (
            <CachedPlanetView
              key={slot.planetId}
              slot={slot}
              paused={paused}
              onSceneBytes={onSceneBytes}
              preference={preference}
              textureLimit={textureLimit}
            />
          ))}
        </Canvas>
      </ErrorBoundary>
    </div>
  );
}
