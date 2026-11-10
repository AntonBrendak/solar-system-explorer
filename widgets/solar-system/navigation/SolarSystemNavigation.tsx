"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import { catalog } from "@/entities/planet/catalog";
import { PlanetPreview, PlanetPreviewProvider } from "@/features/planet-viewer";
import type { SolarMapFocus } from "../model/types";
import { SolarPhoenix } from "../sun/SolarPhoenix";
import { mapLiteTextures } from "../model/map-lite-textures";
import type { SimulationStore } from "../simulation/simulation-store";
import styles from "./solar-system-navigation.module.css";
import type { PerformanceStore } from "../performance/performance-store";

type Props = {
  simulation: SimulationStore;
  performance: PerformanceStore;
  selected: SolarMapFocus;
  animate: boolean;
  preparing: boolean;
  onReady: (id: Exclude<SolarMapFocus, null>) => void;
  onError: () => void;
  onSelect: (target: SolarMapFocus) => void;
  onInspect: (target: SolarMapFocus) => void;
};

export function SolarSystemNavigation({
  simulation,
  performance,
  selected,
  animate,
  preparing,
  onReady,
  onError,
  onSelect,
  onInspect,
}: Props) {
  const t = useTranslations("map");
  const planets = useTranslations("planets");
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = navigation.current?.querySelector<HTMLButtonElement>(
      '[aria-pressed="true"]',
    );
    active?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [selected]);
  const inspect = (target: SolarMapFocus) => ({
    onPointerEnter: () => onInspect(target),
    onPointerLeave: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "touch") onInspect(null);
    },
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "touch") onInspect(target);
    },
    onFocus: () => onInspect(target),
    onBlur: () => onInspect(null),
    "aria-describedby":
      selected === target && target !== null
        ? "solar-object-heading"
        : undefined,
  });

  return (
    <PlanetPreviewProvider
      telemetry={performance.previewSink}
      animate={animate}
      preparing={preparing}
      onError={onError}
    >
      <nav
        ref={navigation}
        className={styles.root}
        aria-label={t("navigation")}
      >
        <ul className={styles.list}>
          <li>
            <button
              type="button"
              className={`${styles.card} ${styles.overview}`}
              aria-pressed={selected === null}
              onClick={() => {
                onInspect(null);
                onSelect(null);
              }}
            >
              <span className={styles.overviewIcon} aria-hidden="true">
                <span />
              </span>
              <span>{t("overview")}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={styles.card}
              data-map-navigation="sun"
              style={{ "--object-accent": "#f3ad77" } as CSSProperties}
              aria-pressed={selected === "sun"}
              onClick={() => onSelect("sun")}
              {...inspect("sun")}
            >
              <span className={styles.visual} aria-hidden="true">
                <PlanetPreview animate={animate} onReady={() => onReady("sun")}>
                  <group scale={0.5}>
                    <SolarPhoenix simulation={simulation} animate={animate} />
                  </group>
                </PlanetPreview>
              </span>
              <span>{t("sun")}</span>
            </button>
          </li>
          {catalog.map((planet) => (
            <li key={planet.id}>
              <button
                type="button"
                className={styles.card}
                data-map-navigation={planet.id}
                style={{ "--object-accent": planet.accent } as CSSProperties}
                aria-pressed={selected === planet.id}
                onClick={() => onSelect(planet.id)}
                {...inspect(planet.id)}
              >
                <span className={styles.visual} aria-hidden="true">
                  <PlanetPreview
                    planetId={planet.id}
                    textureSources={mapLiteTextures}
                    animate={animate}
                    onReady={() => onReady(planet.id)}
                  />
                </span>
                <span>{planets(`${planet.id}.name`)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </PlanetPreviewProvider>
  );
}
