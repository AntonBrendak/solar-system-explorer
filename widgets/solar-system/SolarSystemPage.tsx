"use client";

import Link from "next/link";
import { ArrowLeft, Orbit } from "lucide-react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { messageCatalogs } from "@/i18n/messages";
import { SolarSystemCanvas } from "@/features/planet-viewer";
import styles from "./solar-system.module.css";

function SolarSystemContent({ locale }: { locale: Locale }) {
  const t = useTranslations("ui");
  return (
    <div className={styles.page}>
      <div className={styles.fallbackSky} aria-hidden="true" />
      <div className={styles.sky} data-starfield aria-label={t("solarMapStage")} role="img">
        <SolarSystemCanvas />
      </div>
      <div className={styles.vignette} aria-hidden="true" />
      <header className={styles.header}>
        <Link className={styles.back} href={"/?lang=" + locale}>
          <ArrowLeft size={17} strokeWidth={1.5} />
          <span>{t("solarMapBack")}</span>
        </Link>
        <span className={styles.brand} aria-label="ORBITAL">
          <Orbit size={20} strokeWidth={1.3} />
          ORBITAL<span className={styles.brandDot}>.</span>
        </span>
      </header>
      <main className={styles.content}>
        <p className={styles.eyebrow}><span className={styles.eyebrowLine} />{t("solarMapEyebrow")}</p>
        <h1>{t("solarMapTitle")}</h1>
        <p className={styles.description}>{t("solarMapDescription")}</p>
      </main>
      <footer className={styles.footer}>
        <span>{t("solarMapFooter")}</span>
        <span>ORBITAL / 001</span>
      </footer>
    </div>
  );
}

export function SolarSystemPage({ locale }: { locale: Locale }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messageCatalogs[locale]} timeZone="UTC">
      <SolarSystemContent locale={locale} />
    </NextIntlClientProvider>
  );
}
