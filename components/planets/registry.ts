"use client";

import { lazy } from "react";
import type { PlanetVisualDefinition } from "./types";

/** Register models here; page sections only depend on PlanetVisual. */
const planetVisuals: Record<string, PlanetVisualDefinition> = {
  mercury: {
    Scene: lazy(
      () => import("@/components/planetPreview/MercuryPreview")
    ),

    PreviewScene: lazy(
      () =>
        import("@/components/planetPreview/MercuryPreview").then(
          (module) => ({
            default: module.MercuryLite,
          })
        )
    ),
    Environment: lazy(
      () =>
        import(
          "@/components/planets/mercury/MercuryEnvironment"
        )
    ),
    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Mercury · Solar System Scope · CC BY 4.0",
      description: "Mercury surface texture.",
    },
  },
  venus: {
    Scene: lazy(
      () => import("@/components/planetPreview/VenusPreview")
    ),

    PreviewScene: lazy(
      () =>
        import("@/components/planetPreview/VenusPreview").then(
          (module) => ({
            default: module.VenusLite,
          })
        )
    ),
    Environment: lazy(
      () =>
        import(
          "@/components/planets/venus/VenusEnvironment"
        )
    ),
    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Venus clouds · Solar System Scope · CC BY 4.0",
      description:
        "Enhanced global cloud texture of Venus.",
    },
  },
  earth: {
    Scene: lazy(() => import("@/components/planetPreview/EarthPreview")),
    PreviewScene: lazy(() => import("./earth/LiteEarth")),
    Environment: lazy(() => import("@/components/planets/earth/EarthEnvironment")),
    credits: {
      href: "https://github.com/matteason/live-cloud-maps",
      label:
        "Live Cloud Maps · Contains modified EUMETSAT data · Rain: NASA IMERG · Lightning: NOAA/EUMETSAT playback",
      description:
        "Satellite observations; cloud volume and lightning timing are visual simulations.",
    },
  },
  mars: {
    Scene: lazy(
      () => import("@/components/planetPreview/MarsPreview")
    ),

    PreviewScene: lazy(
      () =>
        import("@/components/planetPreview/MarsPreview").then(
          (module) => ({
            default: module.MarsLite,
          })
        )
    ),
    Environment: lazy(
      () => import("./mars/MarsEnvironment")
    ),
    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Mars · Solar System Scope · CC BY 4.0",
      description:
        "Mars global surface texture based on NASA data.",
    },
  },
  jupiter: {
    Scene: lazy(
      () => import("@/components/planetPreview/JupiterPreview")
    ),

    PreviewScene: lazy(
      () =>
        import("@/components/planetPreview/JupiterPreview").then(
          (module) => ({
            default: module.JupiterLite,
          })
        )
    ),
     Environment: lazy(
      () => import("./jupiter/JupiterEnvironment")
    ),
    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Jupiter · Solar System Scope · CC BY 4.0",
      description:
        "Jupiter global cloud texture based on NASA data.",
    },
  },
  saturn: {
    Scene: lazy(
      () =>
        import(
          "@/components/planetPreview/SaturnPreview"
        )
    ),

    PreviewScene: lazy(
      () =>
        import(
          "@/components/planetPreview/SaturnPreview"
        ).then((module) => ({
          default: module.SaturnLite,
        }))
    ),

    Environment: lazy(
      () =>
        import("./saturn/SaturnEnvironment")
    ),

    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Saturn · Solar System Scope · CC BY 4.0",
      description:
        "Saturn globe and radial ring texture based on NASA imagery.",
    },
  },
  uranus: {
    Scene: lazy(
      () => import("@/components/planetPreview/UranusPreview")
    ),

    PreviewScene: lazy(
      () =>
        import("@/components/planetPreview/UranusPreview").then(
          (module) => ({
            default: module.UranusLite,
          })
        )
    ),

    Environment: lazy(
      () =>
        import(
          "@/components/planets/uranus/UranusEnvironment"
        )
    ),
    credits: {
      href: "https://www.solarsystemscope.com/textures/",
      label: "Uranus · Solar System Scope · CC BY 4.0",
      description:
        "Uranus base texture with animated procedural atmosphere.",
    },
  },
  neptune: {
      Scene: lazy(
        () =>
          import(
            "@/components/planetPreview/NeptunePreview"
          )
      ),

      PreviewScene: lazy(
        () =>
          import(
            "@/components/planetPreview/NeptunePreview"
          ).then((module) => ({
            default: module.NeptuneLite,
          }))
      ),

      Environment: lazy(
        () =>
          import("./neptune/NeptuneEnvironment")
      ),

      credits: {
        href: "https://www.solarsystemscope.com/textures/",
        label: "Neptune · Solar System Scope · CC BY 4.0",
        description:
          "Base texture with procedurally enhanced cloud detail.",
      },
    },
}
export function getPlanetVisual(id: string): PlanetVisualDefinition {
  return planetVisuals[id] ?? {};
}
