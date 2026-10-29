import type { ComponentType, ReactNode } from "react";

/** Scenes supply Three objects only; the shared renderer owns the persistent Canvas. */
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

export type RegisteredPlanetScene = {
  id: string;
  definition: PlanetVisualDefinition;
};
