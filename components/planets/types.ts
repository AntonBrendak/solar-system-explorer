import type { ComponentType, ReactNode } from "react";

export type PlanetPresentation = "hero" | "thumbnail" | "card" | "lab";

/** Scenes supply Three objects only; PlanetStage owns the persistent Canvas. */
export type PlanetSceneProps = {
  active: boolean;
  animate: boolean;
};

export type PlanetEnvironmentProps = PlanetSceneProps & {
  children: ReactNode;
  lighting: "scene" | "studio";
};

export type PlanetVisualDefinition = {
  Scene?: ComponentType<PlanetSceneProps>;
  PreviewScene?: ComponentType<PlanetSceneProps>;
  Environment?: ComponentType<PlanetEnvironmentProps>;
  rings?: "saturn";
  credits?: {
    href: string;
    label: string;
    description: string;
  };
};

export type CachedPlanetScene = {
  id: string;
  definition: PlanetVisualDefinition;
};
