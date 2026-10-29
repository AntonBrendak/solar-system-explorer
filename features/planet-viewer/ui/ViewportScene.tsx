"use client";

import { Suspense, useCallback, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, View } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Group } from "three";
import type { PlanetId } from "@/entities/planet/types";
import { getPlanetVisual } from "../scenes/registry";
import { SceneEntry } from "./PlanetStage";
import { useSceneMotion } from "@/shared/lib/useSceneMotion";
import styles from "./planet-canvas.module.css";
import type {
  QualityPreference,
  SceneQualityState,
} from "../model/texture-quality";

export function ViewportContent({
  planetId,
  detailed,
  paused,
  resetKey,
  onReady,
  onError,
  onDetailedReady,
  active = true,
  target,
  preference = "auto",
  retryKey = 0,
  onQualityState,
  textureLimit,
}: Props) {
  const animate = useSceneMotion(paused, active);
  const entry = useMemo(
    () => ({ id: planetId, definition: getPlanetVisual(planetId) }),
    [planetId],
  );
  const ready = useCallback(() => onReady(), [onReady]);
  const error = useCallback(() => onError(), [onError]);
  const group = useRef<Group>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  // Saturn's own model already fits its rings; compensate only for the shared camera.
  const scale = planetId === "saturn" ? 1.18 : 0.92;
  useFrame((_, delta) => {
    if (!active) return;
    if (group.current) {
      const weight = animate ? 1 - Math.exp(-delta * 5) : 1;
      group.current.scale.setScalar(
        group.current.scale.x + (scale - group.current.scale.x) * weight,
      );
    }
  });
  return (
    <>
      {detailed && planetId === "saturn" && <ambientLight intensity={0.14} />}
      <PerspectiveCamera
        key={resetKey}
        makeDefault
        position={[0, 0, 7.8]}
        fov={38}
      />
      <group ref={group} scale={scale * 0.9}>
        <SceneEntry
          key={planetId}
          entry={entry}
          activeId={active ? planetId : ""}
          previewOnly={!detailed}
          animate={animate}
          onReady={ready}
          onError={error}
          onDetailedReady={onDetailedReady}
          preference={preference}
          textureLimit={textureLimit}
          retryKey={retryKey}
          onQualityState={onQualityState}
        />
      </group>
      {detailed && (
        <OrbitControls
          key={`${planetId}-${resetKey}`}
          ref={controls}
          domElement={target}
          enabled={active}
          makeDefault
          enablePan={false}
          enableZoom={false}
          autoRotate={animate}
          autoRotateSpeed={0.22}
          enableDamping
          dampingFactor={0.08}
        />
      )}
    </>
  );
}
type Props = {
  planetId: PlanetId;
  detailed: boolean;
  paused: boolean;
  resetKey: number;
  onReady: () => void;
  onError: () => void;
  onDetailedReady?: () => void;
  active?: boolean;
  target?: HTMLElement;
  preference?: QualityPreference;
  retryKey?: number;
  onQualityState?: (state: SceneQualityState) => void;
  textureLimit?: number;
};
export default function ViewportScene(props: Props) {
  return (
    <View className={styles.view} index={props.detailed ? 100 : 1}>
      <Suspense fallback={null}>
        <ViewportContent {...props} />
      </Suspense>
    </View>
  );
}
