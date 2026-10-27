"use client";

import { lazy } from "react";
import type { PlanetVisualDefinition } from "./types";

/** Register models here; page sections only depend on PlanetVisual. */
const planetVisuals: Record<string, PlanetVisualDefinition> = {
  earth: {
    Scene: lazy(() => import("@/components/planetPreview/EarthPreview")),
    PreviewScene: lazy(() => import("./LiteEarth")),
    Environment: lazy(() => import("@/components/earth/EarthEnvironment")),
    credits: {
      href: "https://github.com/matteason/live-cloud-maps",
      label:
        "Live Cloud Maps · Contains modified EUMETSAT data · Rain: NASA IMERG · Lightning: NOAA/EUMETSAT playback",
      description:
        "Satellite observations; cloud volume and lightning timing are visual simulations.",
    },
  },
  saturn: { rings: "saturn" },
};

export function getPlanetVisual(id: string): PlanetVisualDefinition {
  return planetVisuals[id] ?? {};
}
