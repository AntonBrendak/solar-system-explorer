import ui from "@/shared/ui/presentation.module.css";
import type { PlanetRecord } from "@/entities/planet/types";
import { useFormatter, useTranslations } from "next-intl";
import { MetricCard } from "@/shared/ui/MetricCard";
import styles from "./characteristics.module.css";

export function PlanetCharacteristics({ planet }: { planet: PlanetRecord }) {
  const t = useTranslations("ui");
  const formatter = useFormatter();
  const format = (value: number) =>
    formatter.number(value, { maximumFractionDigits: 3 });
  const mass = formatter.number(planet.massKg, {
    notation: "scientific",
    maximumFractionDigits: 3,
  });
  return (
    <section aria-label={t("characteristics")}>
      <h3 className={ui.subheading}>{t("characteristics")}</h3>
      <dl className={styles.metrics}>
        <MetricCard
          label={t("diameter")}
          value={format(planet.diameterKm)}
          unit={t("km")}
        />
        <MetricCard label={t("mass")} value={mass} unit={t("kg")} />
        <MetricCard
          label={t("distance")}
          value={format(planet.distanceMillionKm)}
          unit={t("millionKm")}
        />
        <MetricCard
          label={t("year")}
          value={format(planet.orbitDays)}
          unit={t("days")}
        />
        <MetricCard
          label={t("rotation")}
          value={format(Math.abs(planet.rotationHours))}
          unit={t("hours")}
          note={planet.rotationHours < 0 ? t("retrograde") : undefined}
        />
        <MetricCard
          label={t("tilt")}
          value={format(planet.axialTilt)}
          unit={t("degrees")}
        />
      </dl>
      <p className={ui.note}>{t("metricNote")}</p>
    </section>
  );
}
