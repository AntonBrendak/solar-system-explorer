import { ArrowUpRight, Orbit, Pause, Play } from "lucide-react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { useLocale, useTranslations } from "next-intl";
import { IconButton } from "@/shared/ui/IconButton";
import { LanguagePicker } from "@/features/localization";
import styles from "./header.module.css";

export function ObservatoryLogo({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="#home"
      className={styles.logo}
      data-compact={compact}
      aria-label="ORBITAL"
    >
      <span className={styles.logoSymbol} aria-hidden="true">
        <span className={styles.logoOrbitOne} data-motion-logo-orbit="one" />
        <span className={styles.logoOrbitTwo} data-motion-logo-orbit="two" />
        <span className={styles.logoCore} data-motion-logo-core />
        <span className={styles.logoSatelliteTrack}>
          <span className={styles.logoSatellite} data-motion-logo-satellite />
        </span>
      </span>
      <span>
        ORBITAL<span className={styles.logoDot}>.</span>
      </span>
    </a>
  );
}

export function ObservatoryHeader({
  paused,
  onLocale,
  onPause,
}: {
  paused: boolean;
  onLocale: (locale: Locale) => void;
  onPause: () => void;
}) {
  const t = useTranslations("ui");
  const locale = useLocale();
  return (
    <header data-page-shell className={styles.header}>
      <ObservatoryLogo />
      <nav className={styles.navigation} aria-label={t("observatory")}>
        <a href="#collection">{t("collection")}</a>
        <a href="#about">
          {t("about")} <ArrowUpRight size={12} />
        </a>
      </nav>
      <div className={styles.headerActions}>
        <Link
          href={"/solar-system?lang=" + locale}
          prefetch={false}
          className={styles.systemLink}
          aria-label={t("solarMapNav")}
          data-motion-button="system-map"
        >
          <span className={styles.systemOrbit} aria-hidden="true">
            <Orbit size={17} strokeWidth={1.5} />
          </span>
          <span className={styles.systemText}>{t("solarMapNav")}</span>
          <span className={styles.systemMobileText} aria-hidden="true">3D</span>
          <ArrowUpRight className={styles.systemArrow} size={15} aria-hidden="true" />
        </Link>
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
