"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";
import { PreparedModel } from "./PreparedModel";
import { useDeviceProfile } from "../model/useDeviceProfile";
import {
  getTexturePolicy,
  clampTier,
  nextTier,
  type TextureTier,
  type QualityPreference,
  type SceneQualityState,
} from "../model/texture-quality";
import {
  planetTextureMaximum,
  gpuTextureMaximum,
} from "../model/texture-assets";
import { retryFailedTextures } from "../model/useSceneTexture";
import type {
  RegisteredPlanetScene,
  PlanetEnvironmentProps,
} from "../model/types";

function DefaultEnvironment({ children, lighting }: PlanetEnvironmentProps) {
  return (
    <>
      {lighting === "scene" && (
        <>
          <ambientLight intensity={0.15} />
          <directionalLight position={[-5, 2, 5]} intensity={3} />
        </>
      )}
      {children}
    </>
  );
}

type Props = {
  entry: RegisteredPlanetScene;
  active: boolean;
  animate: boolean;
  previewOnly: boolean;
  preference: QualityPreference;
  textureLimit?: number;
  retryKey: number;
  onReady: () => void;
  onError: () => void;
  onDetailedReady?: () => void;
  onQualityState?: (state: SceneQualityState) => void;
};
function CachedScene({
  entry,
  active,
  animate,
  previewOnly,
  preference,
  retryKey,
  onReady,
  onDetailedReady,
  onQualityState,
  textureLimit,
}: Props) {
  const {
    Scene,
    PreviewScene,
    Environment = DefaultEnvironment,
  } = entry.definition;
  const InitialScene = PreviewScene ?? Scene;
  const { gl, size } = useThree();
  const profile = useDeviceProfile();
  const policy = getTexturePolicy({
    ...profile,
    viewWidth: size.width,
    viewHeight: size.height,
    dpr: gl.getPixelRatio(),
    maxTextureSize: Math.min(
      gl.capabilities.maxTextureSize,
      textureLimit ?? Infinity,
    ),
  });
  const maximum = clampTier(
    planetTextureMaximum(entry.id),
    gpuTextureMaximum(
      Math.min(gl.capabilities.maxTextureSize, textureLimit ?? Infinity),
    ),
  );
  const target = clampTier(
    preference === "auto" ? policy.maximum : preference,
    maximum,
  );
  const [base] = useState<TextureTier>(policy.base);
  const [initialReady, setInitialReady] = useState(false);
  const [ready, setReady] = useState<TextureTier | null>(null);
  const [pending, setPending] = useState<TextureTier | null>(null);
  const [failed, setFailed] = useState<TextureTier | null>(null);
  const [attempts, setAttempts] = useState<
    Partial<Record<TextureTier, number>>
  >({});
  const previousActive = useRef(active);
  const previousRetry = useRef(retryKey);
  const axis = useRef<Group>(null);
  const initialPrepared = useCallback(() => setInitialReady(true), []);
  const tierPrepared = useCallback((tier: TextureTier) => {
    setReady(tier);
    setPending((current) => (current === tier ? null : current));
    setFailed(null);
  }, []);
  const fullRendered = useCallback(() => {
    onReady();
    onDetailedReady?.();
  }, [onReady, onDetailedReady]);

  useEffect(() => {
    const retry =
      previousRetry.current !== retryKey || (!previousActive.current && active);
    previousRetry.current = retryKey;
    previousActive.current = active;
    if (!retry || !failed) return;
    retryFailedTextures();
    setAttempts((current) => ({
      ...current,
      [failed]: (current[failed] ?? 0) + 1,
    }));
    setFailed(null);
  }, [active, retryKey, failed]);

  useEffect(() => {
    if (
      !active ||
      profile.hidden ||
      previewOnly ||
      !Scene ||
      !initialReady ||
      pending ||
      failed ||
      ready === target
    )
      return;
    const next = nextTier(ready, base, target);
    const delay = ready
      ? preference === "auto"
        ? policy.upgradeDelay
        : 250
      : 0;
    const timer = window.setTimeout(() => setPending(next), delay);
    return () => window.clearTimeout(timer);
  }, [
    active,
    profile.hidden,
    previewOnly,
    Scene,
    initialReady,
    pending,
    failed,
    ready,
    target,
    base,
    preference,
    policy.upgradeDelay,
  ]);
  useEffect(() => {
    onQualityState?.({
      tier: ready,
      target,
      loading: !failed && (pending !== null || ready !== target),
      failed: failed !== null,
    });
  }, [ready, target, pending, failed, onQualityState]);

  useFrame((_, delta) => {
    if (axis.current && previewOnly && active && animate)
      axis.current.rotation.y += Math.min(delta, 0.1) * 0.18;
  });
  if (!InitialScene) return null;
  const resident = [
    ...new Set(
      [ready, pending].filter((tier): tier is TextureTier => tier !== null),
    ),
  ];
  return (
    <group visible={active}>
      {previewOnly && (
        <>
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 2, 6]} intensity={2.2} />
          <directionalLight position={[-4, -1, 3]} intensity={0.6} />
        </>
      )}
      <Environment
        active={active}
        animate={animate}
        lighting={previewOnly ? "studio" : "scene"}
      >
        <group ref={axis}>
          {!ready && (
            <Suspense fallback={null}>
              <PreparedModel
                Scene={InitialScene}
                tier="1k"
                resourceId={`${entry.id}:preview`}
                active={active}
                animate={animate}
                visible={initialReady}
                onPrepared={initialPrepared}
                onReady={onReady}
              />
            </Suspense>
          )}
          {!previewOnly &&
            Scene &&
            resident.map((tier) => (
              <ErrorBoundary
                key={`${tier}-${attempts[tier] ?? 0}`}
                onError={() => {
                  setFailed(tier);
                  setPending(null);
                }}
              >
                <Suspense fallback={null}>
                  <PreparedModel
                    Scene={Scene}
                    tier={tier}
                    resourceId={`${entry.id}:full:${tier}`}
                    active={active}
                    animate={animate}
                    visible={ready === tier}
                    onPrepared={tierPrepared}
                    onReady={fullRendered}
                  />
                </Suspense>
              </ErrorBoundary>
            ))}
        </group>
      </Environment>
    </group>
  );
}

export function SceneEntry({
  entry,
  activeId,
  animate,
  previewOnly,
  preference = "auto",
  retryKey = 0,
  onReady,
  onError,
  onDetailedReady,
  onQualityState,
  textureLimit,
}: {
  entry: RegisteredPlanetScene;
  activeId: string;
  animate: boolean;
  previewOnly: boolean;
  preference?: QualityPreference;
  textureLimit?: number;
  retryKey?: number;
  onReady: (id: string) => void;
  onError: (id: string) => void;
  onDetailedReady?: () => void;
  onQualityState?: (state: SceneQualityState) => void;
}) {
  const ready = useCallback(() => onReady(entry.id), [entry.id, onReady]);
  const failed = useCallback(() => onError(entry.id), [entry.id, onError]);
  const [activation, setActivation] = useState(0);
  useEffect(() => {
    if (activeId !== entry.id) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        retryFailedTextures();
        setActivation((value) => value + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, entry.id]);
  return (
    <ErrorBoundary resetKey={retryKey * 100000 + activation} onError={failed}>
      <Suspense fallback={null}>
        <CachedScene
          entry={entry}
          active={entry.id === activeId}
          animate={animate && entry.id === activeId}
          previewOnly={previewOnly}
          preference={preference}
          textureLimit={textureLimit}
          retryKey={retryKey}
          onReady={ready}
          onError={failed}
          onDetailedReady={onDetailedReady}
          onQualityState={onQualityState}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
