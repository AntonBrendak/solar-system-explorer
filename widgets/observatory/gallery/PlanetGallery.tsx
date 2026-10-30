import ui from "@/shared/ui/presentation.module.css";
import { useState } from "react";
import { catalog } from "@/entities/planet/catalog";
import type { PlanetId } from "@/entities/planet/types";
import { useTranslations } from "next-intl";
import { AnimatedTabs } from "@/shared/ui/AnimatedTabs";
import { MotionReveal } from "@/shared/ui/MotionReveal";
import { PlanetCard } from "./PlanetCard";
import styles from "./planet-gallery.module.css";

type Filter = "all" | "terrestrial" | "gas" | "ice";
export function PlanetGallery({
  active,
  onOpen,
}: {
  active: boolean;
  onOpen: (id: PlanetId, element: HTMLElement) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const t = useTranslations("ui");
  const filtered = catalog.filter(
    (planet) => filter === "all" || planet.kind === filter,
  );
  return (
    <section
      data-page-shell
      id="collection"
      className={styles.collection}
      aria-labelledby="collection-title"
    >
      <div className={styles.sectionTop}>
        <p className={ui.eyebrow}>
          <span className={ui.line} />
          {t("galleryEyebrow")}
        </p>
        <span className={styles.sectionCount}>SOL / 001—008</span>
      </div>
      <div className={styles.sectionHeading}>
        <h2 id="collection-title">
          {t("galleryTitle")}
          <br />
          <span>{t("galleryTitleSecond")}</span>
        </h2>
        <p>{t("galleryDescription")}</p>
      </div>
      <div className={styles.collectionToolbar}>
        <AnimatedTabs
          items={(["all", "terrestrial", "gas", "ice"] as const).map((id) => ({
            id,
            label: t(id),
          }))}
          value={filter}
          onChange={setFilter}
          label={t("collection")}
          variant="pills"
        />
        <span
          className={styles.results}
          aria-live="polite"
          aria-label={t("modelStatus", { count: filtered.length })}
        >
          {String(filtered.length).padStart(2, "0")} / 08
        </span>
      </div>
      <div className={styles.cardGrid}>
        {filtered.map((planet) => (
          <MotionReveal key={planet.id}>
            <PlanetCard planet={planet} active={active} onOpen={onOpen} />
          </MotionReveal>
        ))}
      </div>
    </section>
  );
}
