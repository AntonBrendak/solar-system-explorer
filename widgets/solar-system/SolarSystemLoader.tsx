
"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import {
  useLocale,
  useMessages,
  useTranslations,
} from "next-intl";
import styles from "./solar-system-loader.module.css";
import { SolarSystemMiniature } from "./SolarSystemMiniature";
import { ObservatoryLogo } from "@/widgets/observatory/header/ObservatoryHeader";

type SolarSystemLoaderProps = {
  progress?: number | null;
};

type PhraseStep = {
  from: number;
  key: string;
};

// Create a random phrase order without repetitions.
// Each new phrase starts after 4–7% of real progress.
function createPhraseSteps(
  phrases: Record<string, string>,
): PhraseStep[] {
  const keys = Object.keys(phrases);

  // Fisher–Yates shuffle
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [keys[i], keys[j]] = [keys[j], keys[i]];
  }

  const steps: PhraseStep[] = [];
  let threshold = 0;

  for (const key of keys) {
    if (threshold >= 100) break;

    steps.push({
      from: threshold,
      key,
    });

    threshold += 4 + Math.floor(Math.random() * 4);
  }

  return steps;
}

export function SolarSystemLoader({
  progress = null,
}: SolarSystemLoaderProps) {
  const t = useTranslations("solarSystem.loader");
  const locale = useLocale();
  const messages = useMessages();

  const phrases: Record<string, string> =
  messages.solarSystem.loader.phrases;
  const [phraseSteps, setPhraseSteps] =
    useState<PhraseStep[]>([]);

  // Initialize phrases on the client.
  useEffect(() => {
  const frame = requestAnimationFrame(() => {
    setPhraseSteps(createPhraseSteps(phrases));
  });

  return () => {
    cancelAnimationFrame(frame);
  };
}, [locale, phrases]);

  // Use only real loading progress.
  const percent =
    typeof progress === "number" &&
    Number.isFinite(progress)
      ? Math.max(
          0,
          Math.min(100, Math.round(progress)),
        )
      : null;

  const isReady = percent === 100;

  // CSS variable for the progress indicator.
  const progressStyle =
    percent === null
      ? undefined
      : ({
          "--progress": `${percent}%`,
        } as CSSProperties);

  // Select the phrase assigned to current progress.
  const activeKey = phraseSteps.reduce<string | null>(
    (selected, step) => {
      if (step.from <= (percent ?? 0)) {
        return step.key;
      }

      return selected;
    },
    null,
  );

  const status = isReady
    ? t("ready")
    : activeKey
      ? phrases[activeKey]
      : t("loading");

  const statusKey = isReady
    ? "ready"
    : activeKey ?? "initial";

  return (
    <section
      className={styles.root}
      aria-label={t("loading")}
    >
      {/* ORBITAL logo */}
      <header className={styles.header}>
        <ObservatoryLogo
          href={`/?lang=${locale}`}
        />

        <span className={styles.headerLabel}>
          {t("loading")}
        </span>
      </header>

      {/* Animated Solar System miniature */}
      <div className={styles.stage}>
        <SolarSystemMiniature />

        <span className={styles.dragHint}>
          {t("dragHint")}
        </span>
      </div>

      {/* Loading information */}
      <div className={styles.bottom}>
        <div className={styles.headline}>
          <h1 className={styles.title}>
            {t("title")}
          </h1>

          {/* Show percentage only if available */}
          {percent !== null && (
            <div className={styles.percent}>
              {percent}
              <small>%</small>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div
          className={styles.progressTrack}
          data-indeterminate={
            percent === null ? "true" : undefined
          }
          style={progressStyle}
          role="progressbar"
          aria-label={t("loading")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          aria-valuetext={
            percent === null
              ? t("loading")
              : undefined
          }
        >
          <div className={styles.progressFill} />

          {percent !== null && (
            <div className={styles.progressDot} />
          )}
        </div>

        {/* Humorous loading phrase */}
        <div
          className={styles.statusRow}
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            key={statusKey}
            className={styles.status}
          >
            {status}
          </span>
        </div>
      </div>
    </section>
  );
}
