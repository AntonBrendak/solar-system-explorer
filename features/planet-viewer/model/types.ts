import type { ComponentType, ReactNode } from "react";
import type { Vector3 } from "three";

/** Scenes supply Three objects only; the shared renderer owns the persistent Canvas. */
export type PlanetSceneProps = {
  active: boolean;
  animate: boolean;
};

export type PlanetEnvironmentProps = PlanetSceneProps & {
  children: ReactNode;
  lighting: "scene" | "studio";
  /** Optional solar direction in the containing map's world coordinates. */
  sunDirection?: Vector3;
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
