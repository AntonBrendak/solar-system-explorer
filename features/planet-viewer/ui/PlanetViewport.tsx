"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PlanetRecord } from "@/entities/planet/types";
import { usePlanetCanvas } from "./PlanetCanvasProvider";
import styles from "./planet-canvas.module.css";
import { useTranslations } from "next-intl";
import type { SceneQualityState } from "../model/texture-quality";

const ViewportScene = dynamic(() => import("./ViewportScene"), { ssr: false });
type Props = {
  planet: PlanetRecord;
  detailed?: boolean;
  enabled?: boolean;
  priority?: boolean;
  label: string;
  resetKey?: number;
  onReady?: () => void;
};

export function PlanetViewport({
  planet,
  detailed = false,
  enabled = true,
  priority = false,
  label,
  resetKey = 0,
  onReady,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const { register, paused, available } = usePlanetCanvas();
  const [visible, setVisible] = useState(priority);
  const [failed, setFailed] = useState(false);
  const [qualityFailed, setQualityFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const t = useTranslations("ui");
  const fail = useCallback(() => setFailed(true), []);
  const qualityFailure = useCallback(
    (value: boolean) => setQualityFailed(value),
    [],
  );
  const retry = async () => {
    const { retryFailedTextures } = await import("../model/useSceneTexture");
    retryFailedTextures();
    setQualityFailed(false);
    setFailed(false);
    setRetryKey((value) => value + 1);
  };
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "80px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const active = visible && enabled && available && !failed;
  useEffect(() => {
    register(id, active);
    return () => register(id, false);
  }, [active, id, register]);
  return (
    <div
      ref={root}
      className={styles.viewport}
      data-planet-view={planet.id}
      data-detailed={detailed}
      role="group"
      aria-label={label}
    >
      {active ? (
        <ActiveViewport
          key={planet.id}
          planet={planet}
          detailed={detailed}
          priority={priority}
          paused={paused}
          resetKey={resetKey}
          onReady={onReady}
          onError={fail}
          retryKey={retryKey}
          onQualityFailure={qualityFailure}
        />
      ) : (
        <PlanetPoster planet={planet} detailed={detailed} priority={priority} />
      )}
      {(failed || qualityFailed) && (
        <div className={styles.recovery} role="status">
          <span>{failed ? t("modelError") : t("detailError")}</span>
          <button type="button" onClick={retry}>
            {t("retry")}
          </button>
        </div>
      )}
    </div>
  );
}

function PlanetPoster({
  planet,
  detailed,
  priority,
  ready = false,
}: {
  planet: PlanetRecord;
  detailed: boolean;
  priority: boolean;
  ready?: boolean;
}) {
  return (
    <Image
      src={planet.image}
      alt=""
      fill
      sizes={
        detailed
          ? "(max-width: 767px) 90vw, 50vw"
          : "(max-width: 767px) 85vw, 35vw"
      }
      priority={priority}
      className={styles.poster}
      style={{ opacity: ready ? 0 : 1 }}
    />
  );
}

// Each viewport waits for a drawn frame, including a retargeted cached model.
function ActiveViewport({
  planet,
  detailed,
  priority,
  paused,
  resetKey,
  onReady,
  onError,
  retryKey,
  onQualityFailure,
}: {
  planet: PlanetRecord;
  detailed: boolean;
  priority: boolean;
  paused: boolean;
  resetKey: number;
  onReady?: () => void;
  onError: () => void;
  retryKey: number;
  onQualityFailure: (failed: boolean) => void;
}) {
  const [ready, setReady] = useState(false);
  const [quality, setQuality] = useState("preview");
  const [detail, setDetail] = useState<SceneQualityState | null>(null);
  const qualityChanged = useCallback(
    (state: SceneQualityState) => {
      setDetail((previous) =>
        previous?.tier === state.tier &&
        previous.target === state.target &&
        previous.loading === state.loading &&
        previous.failed === state.failed
          ? previous
          : state,
      );
      onQualityFailure(state.failed);
    },
    [onQualityFailure],
  );
  const readyCallback = useCallback(() => {
    setReady(true);
    onReady?.();
  }, [onReady]);
  const detailedCallback = useCallback(() => setQuality("full"), []);
  return (
    <div
      className={styles.active}
      data-render-quality={quality}
      data-texture-tier={detail?.tier ?? "preview"}
      data-texture-target={detail?.target}
      data-texture-state={
        detail?.failed ? "failed" : detail?.loading ? "loading" : "settled"
      }
    >
      <PlanetPoster
        planet={planet}
        detailed={detailed}
        priority={priority}
        ready={ready}
      />
      {detailed ? (
        <CachedViewport
          planetId={planet.id}
          resetKey={resetKey}
          onReady={readyCallback}
          onError={onError}
          onDetailedReady={detailedCallback}
          retryKey={retryKey}
          onQualityState={qualityChanged}
        />
      ) : (
        <ViewportScene
          planetId={planet.id}
          detailed={detailed}
          paused={paused}
          resetKey={resetKey}
          onReady={readyCallback}
          onError={onError}
          onDetailedReady={detailedCallback}
        />
      )}
    </div>
  );
}

function CachedViewport({
  planetId,
  resetKey,
  onReady,
  onError,
  onDetailedReady,
  retryKey,
  onQualityState,
}: {
  planetId: PlanetRecord["id"];
  resetKey: number;
  onReady: () => void;
  onError: () => void;
  onDetailedReady: () => void;
  retryKey: number;
  onQualityState: (state: SceneQualityState) => void;
}) {
  const owner = useId();
  const track = useRef<HTMLDivElement>(null);
  const { requestScene, releaseScene } = usePlanetCanvas();
  useEffect(() => {
    requestScene({
      owner,
      planetId,
      track,
      resetKey,
      retryKey,
      onReady,
      onError,
      onDetailedReady,
      onQualityState,
    });
    return () => releaseScene(owner);
  }, [
    owner,
    planetId,
    resetKey,
    retryKey,
    onReady,
    onError,
    onDetailedReady,
    onQualityState,
    requestScene,
    releaseScene,
  ]);
  return <div ref={track} className={styles.view} />;
}
