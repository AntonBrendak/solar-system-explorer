import { ArrowLeft, ArrowRight } from "lucide-react";
import { useMessages, useTranslations } from "next-intl";
import { catalog } from "@/entities/planet/catalog";
import type { PlanetId } from "@/entities/planet/types";
import { AnimatedTabs } from "@/shared/ui/AnimatedTabs";
import { IconButton } from "@/shared/ui/IconButton";
import styles from "./planet-focus.module.css";

export function PlanetFocusSelector({
  value,
  onChange,
}: {
  value: PlanetId;
  onChange: (id: PlanetId) => void;
}) {
  const t = useTranslations("ui");
  const messages = useMessages();
  const index = catalog.findIndex((planet) => planet.id === value);
  return (
    <div className={styles.selector}>
      <span className={styles.label}>{t("selectWorld")}</span>
      <div className={styles.track}>
        <AnimatedTabs
          items={catalog.map((planet) => ({
            id: planet.id,
            label: messages.planets[planet.id].name,
          }))}
          value={value}
          onChange={onChange}
          label={t("selectWorld")}
        />
      </div>
      <div className={styles.controls}>
        <IconButton
          label={t("previous")}
          onClick={() =>
            onChange(catalog[(index + catalog.length - 1) % catalog.length].id)
          }
        >
          <ArrowLeft />
        </IconButton>
        <IconButton
          label={t("next")}
          onClick={() => onChange(catalog[(index + 1) % catalog.length].id)}
        >
          <ArrowRight />
        </IconButton>
      </div>
    </div>
  );
}
