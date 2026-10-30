"use client";

import {
  PlanetViewport,
  usePlanetCanvas,
  getPlanetVisual,
} from "@/features/planet-viewer";
import ui from "@/shared/ui/presentation.module.css";

import { useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  RotateCcw,
  Pause,
  Play,
  X,
} from "lucide-react";
import {
  catalog,
  factSheetSource,
  planetsById,
} from "@/entities/planet/catalog";
import type { Locale } from "@/i18n/config";
import type { PlanetId } from "@/entities/planet/types";
import { useTranslations } from "next-intl";
import { usePlanetStory } from "@/i18n/usePlanetStory";
import type { CardOrigin } from "@/features/explorer";
import { IconButton } from "@/shared/ui/IconButton";
import { usePlanetDialog } from "@/features/explorer";
import { AnimatedTabs } from "@/shared/ui/AnimatedTabs";
import { MotionReveal } from "@/shared/ui/MotionReveal";
import { PlanetCharacteristics } from "./PlanetCharacteristics";
import styles from "./planet-details.module.css";

type Props = {
  planetId: PlanetId;
  locale: Locale;
  origin: CardOrigin | null;
  onClose: () => void;
  onNavigate: (id: PlanetId) => void;
  onPause: () => void;
};
export function PlanetDetailsDialog({
  planetId,
  locale,
  origin,
  onClose,
  onNavigate,
  onPause,
}: Props) {
  const root = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [resetKey, setResetKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"overview" | "characteristics">("overview");
  const planet = planetsById[planetId];
  const story = usePlanetStory(planetId);
  const t = useTranslations("ui");
  const { available, paused, placeCanvas } = usePlanetCanvas();
  const credits = getPlanetVisual(planetId).credits;
  const index = catalog.findIndex((item) => item.id === planetId);
  const previous = usePlanetStory(catalog[(index + 7) % 8].id);
  const next = usePlanetStory(catalog[(index + 1) % 8].id);

  const close = usePlanetDialog({
    root,
    panel,
    closeButton,
    origin,
    onClose,
    placeCanvas,
  });

  const navigate = (direction: number) => {
    const next = catalog[(index + direction + catalog.length) % catalog.length];
    setReady(false);
    setTab("overview");
    scroll.current?.scrollTo({ top: 0, behavior: "instant" });
    onNavigate(next.id);
  };

  return (
    <dialog
      ref={root}
      aria-labelledby="planet-dialog-title"
      aria-describedby="planet-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className={styles.dialogBackdrop}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        className={styles.dialog}
        style={{ "--planet-accent": planet.accent } as CSSProperties}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
          if (event.key !== "Tab") return;
          const elements = [
            ...(panel.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]), a[href], [tabindex='0']",
            ) ?? []),
          ].filter((element) => element.getClientRects().length > 0);
          const first = elements[0];
          const last = elements[elements.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          }
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header className={styles.dialogHeader}>
          <span className={ui.eyebrow}>ORBITAL / {planet.number} — 08</span>
          <span className={styles.dialogCategory}>{story.category}</span>
          <IconButton
            label={paused ? t("play") : t("pause")}
            aria-pressed={paused}
            onClick={onPause}
          >
            {paused ? <Play /> : <Pause />}
          </IconButton>
          <button
            ref={closeButton}
            type="button"
            className={styles.closeButton}
            data-motion-button="text"
            aria-label={t("close")}
            onClick={close}
          >
            <X size={19} />
            <span>ESC</span>
          </button>
        </header>
        <div className={styles.dialogBody}>
          <div className={styles.dialogVisual}>
            <span className={styles.dialogOrbit} />
            <span className={styles.dialogPlanetNumber} aria-hidden="true">
              {planet.number}
            </span>
            <div className={styles.detailPlanet}>
              <PlanetViewport
                key={planetId}
                planet={planet}
                detailed
                priority
                label={story.name}
                resetKey={resetKey}
                onReady={() => setReady(true)}
              />
            </div>
            <div className={styles.viewToolbar}>
              <span>
                <i
                  className={ready && available ? ui.liveDot : ui.loadingDot}
                />
                {!available ? t("fallback") : ready ? t("drag") : t("loading")}
              </span>
              <IconButton
                label={t("reset")}
                onClick={() => setResetKey((value) => value + 1)}
              >
                <RotateCcw />
              </IconButton>
            </div>
            <p className={styles.modelNote}>{t("visualNote")}</p>
          </div>
          <div className={styles.dialogScroll} ref={scroll}>
            <MotionReveal
              key={`${planetId}-${locale}`}
              className={styles.detailContent}
            >
              <div data-dialog-reveal>
                <p className={ui.eyebrow}>{story.category}</p>
                <h2 id="planet-dialog-title">
                  {story.name}
                  <span>.</span>
                </h2>
                <p className={styles.detailHeadline}>{story.headline}</p>
                <p
                  id="planet-dialog-description"
                  className={styles.introduction}
                >
                  {story.introduction}
                </p>
              </div>
              <div className={styles.detailTabs}>
                <AnimatedTabs
                  items={[
                    { id: "overview", label: t("overview") },
                    { id: "characteristics", label: t("characteristics") },
                  ]}
                  value={tab}
                  onChange={setTab}
                  label={story.name}
                />
              </div>
              {tab === "overview" ? (
                <div className={styles.chapterList}>
                  {story.chapters.map((chapter, i) => (
                    <section
                      key={chapter.title}
                      data-dialog-reveal
                      className={styles.chapter}
                    >
                      <span>0{i + 1}</span>
                      <div>
                        <h3>{chapter.title}</h3>
                        <p>{chapter.text}</p>
                      </div>
                    </section>
                  ))}
                  <aside className={styles.discovery}>
                    <span className={ui.eyebrow}>{t("discovery")}</span>
                    <p>{story.discovery}</p>
                  </aside>
                  <PlanetCharacteristics planet={planet} />
                </div>
              ) : (
                <PlanetCharacteristics planet={planet} />
              )}
              <div className={styles.sources}>
                <h3>{t("sources")}</h3>
                <div>
                  <a href={planet.source} target="_blank" rel="noreferrer">
                    {t("sourceFacts")}
                    <ArrowUpRight size={11} />
                  </a>
                  <a href={factSheetSource} target="_blank" rel="noreferrer">
                    {t("sourceNumbers")}
                    <ArrowUpRight size={11} />
                  </a>
                </div>
                {credits && (
                  <a
                    href={credits.href}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.creditLink}
                  >
                    {credits.label}
                    <ArrowUpRight size={11} />
                  </a>
                )}
                <span>{t("reviewed")}</span>
              </div>
            </MotionReveal>
          </div>
        </div>
        <footer className={styles.dialogFooter}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            data-motion-button="text"
            aria-label={t("previous")}
          >
            <ArrowLeft size={17} />
            <span>{previous.name}</span>
          </button>
          <span>
            {planet.number} <i>/ 08</i>
          </span>
          <button
            type="button"
            onClick={() => navigate(1)}
            data-motion-button="text"
            aria-label={t("next")}
          >
            <span>{next.name}</span>
            <ArrowRight size={17} />
          </button>
        </footer>
      </div>
    </dialog>
  );
}
