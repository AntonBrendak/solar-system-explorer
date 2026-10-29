import ui from "@/shared/ui/presentation.module.css";
import { ArrowDown, ArrowUpRight, MoveDown, RotateCcw } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { PlanetViewport } from "@/features/planet-viewer";
import { planetsById } from "@/entities/planet/catalog";
import type { PlanetId } from "@/entities/planet/types";
import { useTranslations } from "next-intl";
import { usePlanetStory } from "@/i18n/usePlanetStory";
import { PositionReadout } from "@/features/ephemeris";
import { PlanetFocusSelector } from "@/features/explorer";
import { IconButton } from "@/shared/ui/IconButton";
import { MotionReveal } from "@/shared/ui/MotionReveal";
import { AmbientBackdrop } from "./AmbientBackdrop";
import styles from "./hero.module.css";

type Props = {
  planetId: PlanetId;
  active: boolean;
  onOpen: (id: PlanetId, element?: HTMLElement) => void;
  onSelect: (id: PlanetId) => void;
};
export function ObservatoryHero({ planetId, active, onOpen, onSelect }: Props) {
  const t = useTranslations("ui");
  const story = usePlanetStory(planetId);
  const planet = planetsById[planetId];
  const [resetKey, setResetKey] = useState(0);
  return (
    <section
      data-page-shell
      className={styles.hero}
      aria-labelledby="hero-title"
      data-hero-planet={planetId}
      style={{ "--planet-accent": planet.accent } as CSSProperties}
    >
      <AmbientBackdrop />
      <MotionReveal className={styles.heroCopy}>
        <p className={ui.eyebrow}>
          <span className={ui.line} />
          {t("heroEyebrow")}
        </p>
        <h1 id="hero-title">
          {t("heroTitle")}
          <br />
          <span>{t("heroTitleSecond")}</span>
        </h1>
        <p className={styles.heroDescription}>{t("heroDescription")}</p>
        <div className={styles.heroActions}>
          <button
            type="button"
            className={ui.primaryButton}
            data-motion-button="primary"
            onClick={(event) => onOpen(planetId, event.currentTarget)}
          >
            <span
              className={ui.buttonSheen}
              data-motion-button-sheen
              aria-hidden="true"
            />
            {t("heroSecondary")}
            <ArrowUpRight size={16} />
          </button>
          <a
            href="#collection"
            className={ui.textButton}
            data-motion-button="text"
          >
            {t("explore")}
            <ArrowDown size={15} />
          </a>
        </div>
        <PositionReadout planetId={planetId} active={active} />
      </MotionReveal>
      <div className={styles.heroVisual}>
        <div className={styles.orbitOne}>
          <span
            className={styles.orbitTraveler}
            data-motion-orbit-traveler="one"
          />
        </div>
        <div className={styles.orbitTwo}>
          <span
            className={styles.orbitTraveler}
            data-motion-orbit-traveler="two"
          />
        </div>
        <div className={styles.planetGlow} data-motion-halo />
        <span className={styles.coordinateTop}>
          SOL SYSTEM / {planet.number}
        </span>
        <div className={styles.heroPlanet}>
          <PlanetViewport
            key={planetId}
            planet={planet}
            detailed
            label={story.name}
            enabled={active}
            resetKey={resetKey}
            priority
          />
        </div>
        <button
          type="button"
          className={styles.focusLabel}
          onClick={(event) => onOpen(planetId, event.currentTarget)}
        >
          <span className={ui.liveDot} />
          <span>
            {t("selected")}
            <strong>{story.name}</strong>
          </span>
          <ArrowUpRight size={17} />
        </button>
        <div className={styles.heroViewControls}>
          <span>{t("drag")}</span>
          <IconButton
            label={t("reset")}
            onClick={() => setResetKey((key) => key + 1)}
          >
            <RotateCcw />
          </IconButton>
        </div>
        <span className={styles.visualIndex}>
          {planet.number} / {story.name.toUpperCase()}
        </span>
      </div>
      <div className={styles.heroSelector}>
        <PlanetFocusSelector value={planetId} onChange={onSelect} />
      </div>
      <a href="#collection" className={styles.scrollHint}>
        <MoveDown size={16} />
        {t("scroll")}
      </a>
      <span className={styles.heroEdition}>{t("atlasEdition")}</span>
    </section>
  );
}
