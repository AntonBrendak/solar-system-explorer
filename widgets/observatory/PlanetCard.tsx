import { ArrowUpRight } from "lucide-react";
import type { CSSProperties, PointerEvent } from "react";
import type { PlanetRecord, PlanetId } from "@/entities/planet/types";
import { PlanetViewport } from "@/features/planet-viewer";
import { useFormatter, useTranslations } from "next-intl";
import { usePlanetStory } from "@/i18n/usePlanetStory";
import styles from "./planet-card.module.css";

export function PlanetCard({
  planet,
  active,
  onOpen,
}: {
  planet: PlanetRecord;
  active: boolean;
  onOpen: (id: PlanetId, element: HTMLElement) => void;
}) {
  const story = usePlanetStory(planet.id);
  const format = useFormatter();
  const t = useTranslations("ui");
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--light-x",
      `${event.clientX - rect.left}px`,
    );
    event.currentTarget.style.setProperty(
      "--light-y",
      `${event.clientY - rect.top}px`,
    );
  };
  return (
    <button
      type="button"
      className={styles.card}
      style={{ "--planet-accent": planet.accent } as CSSProperties}
      onPointerMove={move}
      onClick={(event) => onOpen(planet.id, event.currentTarget)}
      aria-label={`${t("open")}: ${story.name}`}
      aria-haspopup="dialog"
      data-card={planet.id}
    >
      <div className={styles.cardTop}>
        <span>{planet.number} / 08</span>
        <span>{story.category}</span>
        <ArrowUpRight size={15} />
      </div>
      <div className={styles.cardVisual}>
        <span className={styles.cardOrbit} />
        <PlanetViewport planet={planet} label={story.name} enabled={active} />
      </div>
      <div className={styles.cardCopy}>
        <h3>{story.name}</h3>
        <p>{story.headline}</p>
      </div>
      <div className={styles.cardBottom}>
        <span>{t("fromSun")}</span>
        <span>
          {format.number(planet.distanceMillionKm)}{" "}
          <small>{t("millionKm")}</small>
        </span>
      </div>
    </button>
  );
}
