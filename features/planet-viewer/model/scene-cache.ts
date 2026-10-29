import type { RefObject } from "react";
import type { PlanetId } from "@/entities/planet/types";
import type { SceneQualityState } from "./texture-quality";

export const FULL_SCENE_LIMIT = 2;
export const FULL_TEXTURE_BUDGET = 384 * 1024 * 1024;
export type SceneRequest = {
  owner: string;
  planetId: PlanetId;
  track: RefObject<HTMLDivElement | null>;
  resetKey: number;
  retryKey: number;
  onReady: () => void;
  onError: () => void;
  onDetailedReady: () => void;
  onQualityState: (state: SceneQualityState) => void;
};
export type SceneSlot = {
  planetId: PlanetId;
  request: SceneRequest | null;
  lastRequest: SceneRequest;
  bytes: number;
};

/** Oldest first. Active scenes are pinned; the budget may be exceeded by one active model. */
export function trimScenes(slots: SceneSlot[], budget = FULL_TEXTURE_BUDGET) {
  const next = [...slots];
  while (
    next.length > FULL_SCENE_LIMIT ||
    next.reduce((sum, slot) => sum + slot.bytes, 0) > budget
  ) {
    const index = next.findIndex((slot) => !slot.request);
    if (index < 0) break;
    next.splice(index, 1);
  }
  return next;
}

export function acquireScene(
  slots: SceneSlot[],
  request: SceneRequest,
  budget = FULL_TEXTURE_BUDGET,
) {
  const previous = slots.find((slot) => slot.planetId === request.planetId);
  return trimScenes(
    [
      ...slots
        .filter((slot) => slot.planetId !== request.planetId)
        .map((slot) => ({
          ...slot,
          request: slot.request?.owner === request.owner ? null : slot.request,
        })),
      {
        planetId: request.planetId,
        request,
        lastRequest: request,
        bytes: previous?.bytes ?? 0,
      },
    ],
    budget,
  );
}
