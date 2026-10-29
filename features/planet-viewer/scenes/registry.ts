"use client";

import { lazy } from "react";
import type { PlanetVisualDefinition } from "../model/types";
import type { PlanetId } from "@/entities/planet/types";

/** Model registration is independent of page layout and localized content. */
const planetVisuals: Record<PlanetId, PlanetVisualDefinition> = {
  mercury: {
    Scene: lazy(() => import("./mercury/MercuryScene")),

    PreviewScene: lazy(() =>
      import("./mercury/MercuryScene").then((module) => ({
        default: module.MercuryLite,
      })),
    ),
    Environment: lazy(() => import("./mercury/MercuryEnvironment")),
    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Mercury · Solar System Scope · CC BY 4.0",
      description: "Mercury surface texture.",
    },
  },
  venus: {
    Scene: lazy(() => import("./venus/VenusScene")),

    PreviewScene: lazy(() =>
      import("./venus/VenusScene").then((module) => ({
        default: module.VenusLite,
      })),
    ),
    Environment: lazy(() => import("./venus/VenusEnvironment")),
    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Venus clouds · Solar System Scope · CC BY 4.0",
      description: "Enhanced global cloud texture of Venus.",
    },
  },
  earth: {
    Scene: lazy(() => import("./earth/EarthScene")),
    PreviewScene: lazy(() => import("./earth/LiteEarth")),
    Environment: lazy(() => import("./earth/EarthEnvironment")),
    credits: {
      href: "https://github.com/matteason/live-cloud-maps",
      label:
        "Live Cloud Maps · Contains modified EUMETSAT data · Rain: NASA IMERG · Lightning: NOAA/EUMETSAT playback",
      description:
        "Satellite observations; cloud volume and lightning timing are visual simulations.",
    },
  },
  mars: {
    Scene: lazy(() => import("./mars/MarsScene")),

    PreviewScene: lazy(() =>
      import("./mars/MarsScene").then((module) => ({
        default: module.MarsLite,
      })),
    ),
    Environment: lazy(() => import("./mars/MarsEnvironment")),
    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Mars · Solar System Scope · CC BY 4.0",
      description: "Mars global surface texture based on NASA data.",
    },
  },
  jupiter: {
    Scene: lazy(() => import("./jupiter/JupiterScene")),

    PreviewScene: lazy(() =>
      import("./jupiter/JupiterScene").then((module) => ({
        default: module.JupiterLite,
      })),
    ),
    Environment: lazy(() => import("./jupiter/JupiterEnvironment")),
    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Jupiter · Solar System Scope · CC BY 4.0",
      description: "Jupiter global cloud texture based on NASA data.",
    },
  },
  saturn: {
    Scene: lazy(() => import("./saturn/SaturnScene")),

    PreviewScene: lazy(() =>
      import("./saturn/SaturnScene").then((module) => ({
        default: module.SaturnLite,
      })),
    ),

    Environment: lazy(() => import("./saturn/SaturnEnvironment")),

    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Saturn · Solar System Scope · CC BY 4.0",
      description:
        "Saturn globe and radial ring texture based on NASA imagery.",
    },
  },
  uranus: {
    Scene: lazy(() => import("./uranus/UranusScene")),

    PreviewScene: lazy(() =>
      import("./uranus/UranusScene").then((module) => ({
        default: module.UranusLite,
      })),
    ),

    Environment: lazy(() => import("./uranus/UranusEnvironment")),
    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Uranus · Solar System Scope · CC BY 4.0",
      description: "Uranus base texture with animated procedural atmosphere.",
    },
  },
  neptune: {
    Scene: lazy(() => import("./neptune/NeptuneScene")),

    PreviewScene: lazy(() =>
      import("./neptune/NeptuneScene").then((module) => ({
        default: module.NeptuneLite,
      })),
    ),

    Environment: lazy(() => import("./neptune/NeptuneEnvironment")),

    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Neptune · Solar System Scope · CC BY 4.0",
      description: "Base texture with procedurally enhanced cloud detail.",
    },
  },
};
export function getPlanetVisual(id: PlanetId): PlanetVisualDefinition {
  return planetVisuals[id];
}
