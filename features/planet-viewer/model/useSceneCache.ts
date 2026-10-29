"use client";

import { useCallback, useEffect, useState } from "react";
import {
  acquireScene,
  trimScenes,
  type SceneRequest,
  type SceneSlot,
} from "./scene-cache";

export function useSceneCache(budget: number) {
  const [scenes, setScenes] = useState<SceneSlot[]>([]);
  const clearScenes = useCallback(() => setScenes([]), []);
  const requestScene = useCallback(
    (request: SceneRequest) => {
      setScenes((slots) => acquireScene(slots, request, budget));
    },
    [budget],
  );
  useEffect(() => {
    const trim = () =>
      setScenes((slots) => {
        const trimmed = trimScenes(slots, budget);
        return trimmed.length === slots.length ? slots : trimmed;
      });
    window.addEventListener("resize", trim);
    return () => window.removeEventListener("resize", trim);
  }, [budget]);
  const releaseScene = useCallback(
    (owner: string) => {
      setScenes((slots) =>
        slots.map((slot) =>
          slot.request?.owner === owner ? { ...slot, request: null } : slot,
        ),
      );
      // Allow hero → dialog ownership transfer in the same commit before evicting
      // an oversized model that is no longer pinned by an active viewport.
      queueMicrotask(() =>
        setScenes((slots) => {
          const trimmed = trimScenes(slots, budget);
          return trimmed.length === slots.length ? slots : trimmed;
        }),
      );
    },
    [budget],
  );
  const reportSceneBytes = useCallback(
    (planetId: string, bytes: number) => {
      setScenes((slots) =>
        trimScenes(
          slots.map((slot) =>
            slot.planetId === planetId ? { ...slot, bytes } : slot,
          ),
          budget,
        ),
      );
    },
    [budget],
  );
  return { scenes, requestScene, releaseScene, reportSceneBytes, clearScenes };
}
