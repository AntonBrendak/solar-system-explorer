"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { planetIds } from "@/entities/planet/types";
import type { PlanetId } from "@/entities/planet/types";
import { useSceneMotion } from "@/shared/lib/useSceneMotion";
import { SolarSystemNavigation } from "./navigation/SolarSystemNavigation";
import { SolarObjectInfo } from "./info/SolarObjectInfo";
import { HudStatus } from "./info/HudStatus";
import { createPerformanceStore } from "./performance/performance-store";
import { PerformanceMonitor } from "./performance/PerformanceMonitor";
import { PerformancePanel } from "./performance/PerformancePanel";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";
import { ResourceBudgetProvider } from "@/features/planet-viewer";

import { SolarSystemLoader } from "./SolarSystemLoader";
import { SolarSystemBodies } from "./SolarSystemBodies";
import { MarkerProjection } from "./markers/MarkerProjection";
import { SolarSystemMarkers } from "./markers/SolarSystemMarkers";
import { createMarkerStore } from "./markers/marker-store";
import { createCameraStore } from "./camera/camera-store";
import { CameraToolbar } from "./camera/CameraToolbar";
import { createSimulationStore } from "./simulation/simulation-store";
import { SimulationClock } from "./simulation/SimulationClock";
import { SimulationToolbar } from "./simulation/SimulationToolbar";

import { SolarSystemCameraRig } from "./SolarSystemCameraRig";

import type { SolarMapFocus } from "./model/types";

import { SolarPhoenix } from "./sun/SolarPhoenix";
import { SunBloom } from "./sun/SunBloom";

import { SkySystem } from "./sky/SkySystem";
import { atlasLock } from "./sky/model/sky-manifest";
import { CelestialSky } from "./sky/CelestialSky";

import { useMapReadiness } from "./model/useMapReadiness";

import styles from "./solar-system-map.module.css";

export function SolarSystemExperience() {
  return (
    <ResourceBudgetProvider>
      <MapExperience />
    </ResourceBudgetProvider>
  );
}

function MapExperience() {
  const t = useTranslations("map");
  const locale = useLocale();
  const [sceneFailed, setSceneFailed] = useState(false);
  const [skyState, setSkyState] = useState<"ready" | "restoring" | "failed">(
    "ready",
  );
  const handleSceneError = useCallback(() => setSceneFailed(true), []);

  const {
    sky,
    sunReady,
    readyModels,
    showLoader,
    sceneReady,
    progress,
    handleBaseSkyReady,
    handleOrbitModelReady,
    handlePreviewReady,
    handlePreviewError,
    handleSkyReady,
    handleSunReady,
  } = useMapReadiness();

  const simulation = useMemo(() => createSimulationStore(), []);
  const performanceStore = useMemo(() => createPerformanceStore(), []);
  const handleSkyPrepared = useCallback(() => {
    handleBaseSkyReady();
    handleSkyReady();
  }, [handleBaseSkyReady, handleSkyReady]);
  const [orbitDate, setOrbitDate] = useState(() => new Date());
  const [infoTarget, setInfoTarget] = useState<SolarMapFocus>(null);
  const [markerHover, setMarkerHover] = useState<SolarMapFocus>(null);
  const [detailError, setDetailError] = useState<PlanetId | null>(null);
  const [markerStore] = useState(createMarkerStore);
  const cameraStore = useMemo(() => createCameraStore(), []);
  const highlightedTarget = markerHover ?? infoTarget;

  const [selection, setSelection] = useState<{
    target: SolarMapFocus;
    requestId: number;
  }>({ target: null, requestId: 0 });
  const focusedTarget = selection.target;
  const animate = useSceneMotion(false, true);
  const hud = useRef<HTMLDivElement>(null);
  const [bottomInset, setBottomInset] = useState(0);
  const [sideInset, setSideInset] = useState(0);
  const [topInset, setTopInset] = useState(0);
  const [infoCollapsed, setInfoCollapsed] = useState(false);
  const infoPanel = useRef<HTMLElement>(null);

  const handleSelect = useCallback((target: SolarMapFocus) => {
    setSelection((previous) => ({ target, requestId: previous.requestId + 1 }));
  }, []);
  const handleRestoreFocus = useCallback((target: SolarMapFocus) => {
    setSelection((previous) =>
      previous.target === target ? previous : { ...previous, target },
    );
  }, []);

  useEffect(() => {
    const element = hud.current;
    if (!element) return;
    const measure = () => {
      const bottom = Number.parseFloat(getComputedStyle(element).bottom) || 0;
      setBottomInset(element.offsetHeight + bottom + 12);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [sceneFailed]);

  useEffect(() => {
    const element = infoPanel.current;
    if (!element) return;
    const measure = () => {
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      const bounds = element.getBoundingClientRect();
      setSideInset(
        focusedTarget !== null && !infoCollapsed && desktop
          ? Math.ceil(bounds.right) + 16
          : 0,
      );
      setTopInset(desktop ? 0 : Math.ceil(bounds.bottom) + 12);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [focusedTarget, infoCollapsed, sceneFailed]);

  const controlsBlocked = showLoader || skyState !== "ready";

  if (sceneFailed) {
    return (
      <main className={styles.root}>
        <div role="alert" className={styles.fallback}>
          <h1>{t("unavailable")}</h1>
          <Link href={`/?lang=${locale}`}>{t("home")}</Link>
        </div>
      </main>
    );
  }

  return (
    <main
      onPointerDown={(event) => {
        if (!hud.current?.contains(event.target as Node)) setInfoTarget(null);
      }}
      data-sky-ready={sky.ready}
      data-sun-ready={sunReady}
      data-models-ready={`${readyModels.size}/${planetIds.length * 2 + 1}`}
      data-scene-ready={sceneReady}
      data-sky-progress={`${sky.uploaded}/${sky.total}`}
      className={styles.root}
      style={{ "--map-bottom-inset": `${bottomInset}px` } as CSSProperties}
    >
      <Link className={styles.homeLink} href={`/?lang=${locale}`}>
        <span aria-hidden="true">←</span>
        <span>{t("home")}</span>
      </Link>
      {skyState !== "ready" && (
        <div
          className={styles.skyFallback}
          role="status"
          data-sky-fallback={skyState}
          style={
            atlasLock.root
              ? { backgroundImage: `url(${atlasLock.root}/reserve.webp)` }
              : undefined
          }
        >
          <p>
            {t(skyState === "restoring" ? "skyRestoring" : "skyUnavailable")}
          </p>
        </div>
      )}
      <div
        className={styles.scene}
        inert={controlsBlocked}
        aria-hidden={controlsBlocked}
      >
        <ErrorBoundary onError={handleSceneError}>
          <Canvas
            camera={{
              position: [0, 850, 1800],
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
              gl.domElement.dataset.mapCanvas = "true";
              // PerformanceMonitor resets once per complete frame, including bloom passes.
              gl.info.autoReset = false;
              gl.toneMapping = ACESFilmicToneMapping;

              gl.toneMappingExposure = 0.9;
            }}
          >
            <SimulationClock store={simulation} onOrbitDate={setOrbitDate} />
            <PerformanceMonitor store={performanceStore} />
            <CelestialSky simulation={simulation}>
              <SkySystem
                resourcesReady={
                  sunReady && readyModels.size === planetIds.length * 2 + 1
                }
                onReady={handleSkyPrepared}
                onState={setSkyState}
                onMetrics={performanceStore.publishSky}
              />
            </CelestialSky>

            <ambientLight intensity={0.22} />
            <pointLight
              position={[0, 0, 0]}
              intensity={3.2}
              decay={0}
              color="#fff5e7"
            />
            <SolarPhoenix
              simulation={simulation}
              onReady={handleSunReady}
              animate={animate}
            />

            <SolarSystemBodies
              simulation={simulation}
              orbitDate={orbitDate}
              focusActive={focusedTarget !== null}
              focusedPlanet={focusedTarget === "sun" ? null : focusedTarget}
              hoveredPlanet={
                highlightedTarget === "sun" ? null : highlightedTarget
              }
              onPlanetSelect={handleSelect}
              animate={animate}
              onPlanetReady={handleOrbitModelReady}
              onDetailError={setDetailError}
            />

            <SunBloom />

            <SolarSystemCameraRig
              simulation={simulation}
              focus={focusedTarget}
              requestId={selection.requestId}
              bottomInset={bottomInset}
              sideInset={sideInset}
              topInset={topInset}
              enabled={!showLoader}
              canvasLabel={t("camera.canvas")}
              store={cameraStore}
              onRestoreFocus={handleRestoreFocus}
            />
            <MarkerProjection
              simulation={simulation}
              selected={focusedTarget}
              bottomInset={bottomInset}
              sideInset={sideInset}
              topInset={topInset}
              store={markerStore}
            />
          </Canvas>
        </ErrorBoundary>
      </div>

      <SolarSystemMarkers
        store={markerStore}
        selected={focusedTarget}
        hidden={controlsBlocked}
        onSelect={handleSelect}
        onHover={setMarkerHover}
      />
      <PerformancePanel store={performanceStore} hidden={showLoader} />

      <aside
        ref={infoPanel}
        className={styles.info}
        aria-hidden={controlsBlocked}
        inert={controlsBlocked}
        data-loading={showLoader}
      >
        <HudStatus selected={focusedTarget} camera={cameraStore} />
        {focusedTarget !== null && (
          <SolarObjectInfo
            key={focusedTarget}
            selected={focusedTarget}
            simulation={simulation}
            collapsed={infoCollapsed}
            onToggle={() => setInfoCollapsed((value) => !value)}
          />
        )}
      </aside>

      <div
        ref={hud}
        className={styles.hud}
        data-loading={!sceneReady}
        aria-hidden={controlsBlocked}
        inert={controlsBlocked}
      >
        {sky.error && (
          <div role="status" className={styles.skyError}>
            {t("skyError")}
          </div>
        )}
        {detailError && (
          <div role="status" className={styles.skyError}>
            {t("detailError")}
          </div>
        )}
        <SimulationToolbar store={simulation} />
        <CameraToolbar store={cameraStore} />
        <SolarSystemNavigation
          performance={performanceStore}
          simulation={simulation}
          selected={focusedTarget}
          onSelect={handleSelect}
          onInspect={setInfoTarget}
          animate={animate}
          preparing={showLoader}
          onReady={handlePreviewReady}
          onError={handlePreviewError}
        />
      </div>

      {showLoader && (
        <div className={styles.loader} data-ready={sceneReady}>
          <SolarSystemLoader progress={progress} />
        </div>
      )}
    </main>
  );
}
