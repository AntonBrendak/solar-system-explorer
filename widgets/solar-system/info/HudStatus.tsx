"use client";

import { useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { CameraStore } from "../camera/camera-store";
import type { SolarMapFocus } from "../model/types";
import styles from "./hud-status.module.css";

export function HudStatus({
  selected,
  camera,
}: {
  selected: SolarMapFocus;
  camera: CameraStore;
}) {
  const state = useSyncExternalStore(
    camera.subscribe,
    camera.getSnapshot,
    camera.getServerSnapshot,
  );
  const t = useTranslations("map.hud");
  const map = useTranslations("map");
  const planets = useTranslations("planets");
  const format = useFormatter();
  const name =
    selected === null
      ? map("overview")
      : selected === "sun"
        ? map("sun")
        : planets(`${selected}.name`);
  const distance =
    state.distanceTarget === selected && state.distanceKm !== null
      ? t("distanceValue", {
          value: format.number(state.distanceKm, {
            maximumFractionDigits: state.distanceKm < 1000 ? 1 : 0,
          }),
        })
      : t("unknownDistance");
  return (
    <section className={styles.root} aria-label={t("status")}>
      <div className={styles.heading}>
        <p role="status">
          <span
            className={styles.dot}
            data-selected={selected !== null}
            aria-hidden="true"
          />
          {name}
        </p>
      </div>
      <dl className={styles.readout}>
        <div>
          <dt>{t("controlMode")}</dt>
          <dd aria-live="polite">
            {state.flying
              ? map("camera.traveling")
              : map(state.mode === "free" ? "camera.free" : "camera.orbit")}
          </dd>
        </div>
        <div aria-live="off">
          <dt>{t("cameraDistance")}</dt>
          <dd>{distance}</dd>
        </div>
      </dl>
    </section>
  );
}
