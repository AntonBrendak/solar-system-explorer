"use client";

import { useRef } from "react";
import { usePageMetadata } from "@/features/localization";
import { useAmbientMotion } from "@/features/motion";

import type { Locale } from "@/i18n/config";
import type { PlanetId } from "@/entities/planet/types";
import { useExplorer } from "@/features/explorer";
import { PlanetCanvasProvider } from "@/features/planet-viewer";
import { ObservatoryHeader } from "./ObservatoryHeader";
import { ObservatoryHero } from "./ObservatoryHero";
import { PlanetGallery } from "./PlanetGallery";
import { ObservatoryAbout } from "./ObservatoryAbout";
import { PlanetDetailsDialog } from "./PlanetDetailsDialog";
import styles from "./observatory.module.css";
import { NextIntlClientProvider } from "next-intl";
import { messageCatalogs } from "@/i18n/messages";

export default function Observatory({
  initialLocale = "en",
  initialPlanet = null,
  initialFocus = "mercury",
  siteOrigin,
}: {
  initialLocale?: Locale;
  initialPlanet?: PlanetId | null;
  initialFocus?: PlanetId;
  siteOrigin: string;
}) {
  const explorer = useExplorer(initialLocale, initialPlanet, initialFocus);
  usePageMetadata(explorer.locale, siteOrigin);
  const motionRoot = useRef<HTMLDivElement>(null);
  useAmbientMotion(
    motionRoot,
    explorer.motionPaused || explorer.selected !== null,
  );
  return (
    <NextIntlClientProvider
      locale={explorer.locale}
      messages={messageCatalogs[explorer.locale]}
      timeZone="UTC"
    >
      <PlanetCanvasProvider paused={explorer.motionPaused}>
        <div ref={motionRoot}>
          <div
            className={styles.page}
            id="home"
            inert={explorer.selected !== null}
            data-paused={explorer.motionPaused}
          >
            <ObservatoryHeader
              paused={explorer.motionPaused}
              onLocale={explorer.changeLocale}
              onPause={() => explorer.setMotionPaused(!explorer.motionPaused)}
            />
            <main>
              <ObservatoryHero
                planetId={explorer.focused}
                active={!explorer.selected}
                onOpen={explorer.openPlanet}
                onSelect={explorer.focusPlanet}
              />
              <PlanetGallery
                active={!explorer.selected}
                onOpen={explorer.openPlanet}
              />
              <ObservatoryAbout />
            </main>
          </div>
          {explorer.selected && (
            <PlanetDetailsDialog
              planetId={explorer.selected}
              locale={explorer.locale}
              origin={explorer.origin}
              onClose={explorer.closePlanet}
              onNavigate={explorer.changePlanet}
              onPause={() => explorer.setMotionPaused(!explorer.motionPaused)}
            />
          )}
        </div>
      </PlanetCanvasProvider>
    </NextIntlClientProvider>
  );
}
