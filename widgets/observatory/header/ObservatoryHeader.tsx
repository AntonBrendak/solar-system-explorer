
import { ArrowUpRight, Pause, Play } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { useTranslations } from "next-intl";

import { IconButton } from "@/shared/ui/IconButton";
import { LanguagePicker } from "@/features/localization";

import { SolarMapEntry } from "./SolarMapEntry";
import styles from "./header.module.css";

export function ObservatoryLogo({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <a
      href="#home"
      className={styles.logo}
      data-compact={compact}
      aria-label="ORBITAL"
    >
      <span className={styles.logoSymbol} aria-hidden="true">
        <span
          className={styles.logoOrbitOne}
          data-motion-logo-orbit="one"
        />
        <span
          className={styles.logoOrbitTwo}
          data-motion-logo-orbit="two"
        />
        <span
          className={styles.logoCore}
          data-motion-logo-core
        />
        <span className={styles.logoSatelliteTrack}>
          <span
            className={styles.logoSatellite}
            data-motion-logo-satellite
          />
        </span>
      </span>

      <span>
        ORBITAL<span className={styles.logoDot}>.</span>
      </span>
    </a>
  );
}

type ObservatoryHeaderProps = {
  paused: boolean;
  onLocale: (locale: Locale) => void;
  onPause: () => void;
};

export function ObservatoryHeader({
  paused,
  onLocale,
  onPause,
}: ObservatoryHeaderProps) {
  const t = useTranslations("ui");

  return (
    <header data-page-shell className={styles.header}>
      <ObservatoryLogo />

      <nav
        className={styles.navigation}
        aria-label={t("observatory")}
      >
        <a href="#collection">
          {t("collection")}
        </a>

        <a href="#about">
          {t("about")}
          <ArrowUpRight size={12} />
        </a>
      </nav>

      <div className={styles.headerActions}>
        <SolarMapEntry paused={paused} />

        <LanguagePicker onChange={onLocale} />

        <IconButton
          label={paused ? t("play") : t("pause")}
          aria-pressed={paused}
          onClick={onPause}
        >
          {paused ? <Play /> : <Pause />}
        </IconButton>
      </div>
    </header>
  );
}
