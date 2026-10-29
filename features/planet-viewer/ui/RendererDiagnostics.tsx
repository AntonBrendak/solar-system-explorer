"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { FULL_SCENE_LIMIT, type SceneSlot } from "../model/scene-cache";
import { rendererSnapshot } from "../model/scene-resources";
import type { QualityPreference } from "../model/texture-quality";

export type RenderDiagnostics = ReturnType<typeof rendererSnapshot> & {
  fullSceneLimit: number;
  textureBudget: number;
  preference: QualityPreference;
  canvasSize: { width: number; height: number; top: number; left: number };
  fullScenes: {
    planetId: string;
    active: boolean;
    estimatedTextureBytes: number;
  }[];
};
declare global {
  interface Window {
    __ORBITAL_RENDERER__?: { snapshot: () => RenderDiagnostics };
  }
}
export function RendererDiagnostics({
  scenes,
  textureBudget,
  preference,
}: {
  scenes: SceneSlot[];
  textureBudget: number;
  preference: QualityPreference;
}) {
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("diagnostics")) return;
    window.__ORBITAL_RENDERER__ = {
      snapshot: () => ({
        ...rendererSnapshot(gl),
        canvasSize: get().size,
        fullSceneLimit: FULL_SCENE_LIMIT,
        textureBudget,
        preference,
        fullScenes: scenes.map((slot) => ({
          planetId: slot.planetId,
          active: !!slot.request,
          estimatedTextureBytes: slot.bytes,
        })),
      }),
    };
    return () => {
      delete window.__ORBITAL_RENDERER__;
    };
  }, [gl, get, scenes, textureBudget, preference]);
  return null;
}
