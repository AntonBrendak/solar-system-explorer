"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import { useThree } from "@react-three/fiber";
import { View } from "@react-three/drei";
import { ViewportContent } from "./ViewportScene";
import type { SceneSlot } from "../model/scene-cache";
import {
  estimatedSceneBytes,
  recordFullActivation,
} from "../model/scene-resources";
import type { QualityPreference } from "../model/texture-quality";

export function CachedPlanetView({
  slot,
  paused,
  onSceneBytes,
  preference,
  textureLimit,
}: {
  slot: SceneSlot;
  paused: boolean;
  onSceneBytes: (id: string, bytes: number) => void;
  preference: QualityPreference;
  textureLimit: number;
}) {
  const request = slot.request ?? slot.lastRequest;
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = performance.now();
  }, [slot.request]);
  const fullReady = useCallback(() => {
    if (!slot.request) return;
    recordFullActivation(slot.planetId, startedAt.current);
    slot.request.onDetailedReady();
    onSceneBytes(slot.planetId, estimatedSceneBytes(`${slot.planetId}:full`));
  }, [slot.request, slot.planetId, onSceneBytes]);
  return (
    <View
      track={request.track as RefObject<HTMLElement>}
      visible={!!slot.request}
      index={100}
    >
      <Suspense fallback={null}>
        <ViewportContent
          planetId={slot.planetId}
          detailed
          paused={paused}
          active={!!slot.request}
          resetKey={request.resetKey}
          retryKey={request.retryKey}
          preference={preference}
          textureLimit={textureLimit}
          target={request.track.current ?? undefined}
          onReady={slot.request ? request.onReady : noop}
          onError={slot.request ? request.onError : noop}
          onDetailedReady={fullReady}
          onQualityState={slot.request ? request.onQualityState : undefined}
        />
        <TrackSize target={request.track.current} />
      </Suspense>
    </View>
  );
}
function noop() {}
function TrackSize({ target }: { target: HTMLDivElement | null }) {
  // View portals inherit the root's setSize closure. Update only this portal's
  // store; changing the root size offsets every scissor region on the page.
  const set = useThree((state) => state.set);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!target) return;
    const resize = () => {
      const rect = target.getBoundingClientRect();
      if (rect.width && rect.height)
        set({
          size: {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
          },
        });
      invalidate();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(target);
    return () => observer.disconnect();
  }, [target, set, invalidate]);
  return null;
}
