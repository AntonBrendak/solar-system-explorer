"use client";

import { useId, useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { FLIGHT_SPEED_RANGE_KM_S, type CameraStore } from "./camera-store";
import styles from "./camera-toolbar.module.css";

export function CameraToolbar({ store }: { store: CameraStore }) {
  const t = useTranslations("map.camera");
  const format = useFormatter();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const speedId = useId();
  const speedHelpId = useId();
  const sliderPosition = Math.round(
    (1000 * Math.log(state.speedKmPerSecond / FLIGHT_SPEED_RANGE_KM_S.min)) /
      Math.log(FLIGHT_SPEED_RANGE_KM_S.max / FLIGHT_SPEED_RANGE_KM_S.min),
  );
  const speed = t("speedValue", {
    value: format.number(state.speedKmPerSecond, {
      maximumFractionDigits: 0,
    }),
  });
  return (
    <section className={styles.root} aria-label={t("controls")}>
      <div className={styles.modes} role="group" aria-label={t("mode")}>
        <button
          type="button"
          aria-pressed={state.mode === "orbit"}
          onClick={() => store.command({ type: "mode", mode: "orbit" })}
        >
          {t("orbit")}
        </button>
        <button
          type="button"
          aria-pressed={state.mode === "free"}
          onClick={() => store.command({ type: "mode", mode: "free" })}
        >
          {t("free")}
        </button>
      </div>
      {state.mode === "free" && (
        <div className={styles.speedRow}>
          <label htmlFor={speedId}>{t("speed")}</label>
          <input
            id={speedId}
            type="range"
            min={0}
            max={1000}
            step={1}
            value={sliderPosition}
            aria-valuemin={FLIGHT_SPEED_RANGE_KM_S.min}
            aria-valuemax={FLIGHT_SPEED_RANGE_KM_S.max}
            aria-valuenow={state.speedKmPerSecond}
            aria-valuetext={speed}
            aria-describedby={speedHelpId}
            onPointerUp={() => store.resumeCamera()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                store.resumeCamera();
              }
            }}
            onChange={(event) =>
              store.setSpeedKmPerSecond(
                FLIGHT_SPEED_RANGE_KM_S.min *
                  (FLIGHT_SPEED_RANGE_KM_S.max / FLIGHT_SPEED_RANGE_KM_S.min) **
                    (Number(event.target.value) / 1000),
              )
            }
          />
          <output htmlFor={speedId}>{speed}</output>
          <span id={speedHelpId} className={styles.srOnly}>
            {t("speedHelp")}
          </span>
        </div>
      )}
      <span role="status" className={styles.srOnly}>
        {state.flying
          ? t("traveling")
          : state.mode === "free"
            ? t("free")
            : t("orbit")}
      </span>
    </section>
  );
}
