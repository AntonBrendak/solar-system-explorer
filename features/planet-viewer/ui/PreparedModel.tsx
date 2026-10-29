"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from "react";
import { addAfterEffect, useThree } from "@react-three/fiber";
import { type Group } from "three";
import {
  sceneTextures,
  registerSceneResources,
  recordPreparation,
} from "../model/scene-resources";
import { idleTurn } from "@/shared/lib/idle-task";
import { TextureTierContext, type TextureTier } from "../model/texture-quality";
import type { PlanetSceneProps } from "../model/types";

/** Upload one texture per idle turn, then compile without a synchronous readiness wait. */
function PrepareScene({
  root,
  active,
  onPrepared,
  resourceId,
}: {
  root: RefObject<Group | null>;
  active: boolean;
  onPrepared: () => void;
  resourceId: string;
}) {
  const { gl, camera, scene, invalidate } = useThree();
  const prepared = useRef(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (root.current) return registerSceneResources(root.current, resourceId);
  }, [root, resourceId]);
  useEffect(() => {
    if (!active || prepared.current || !root.current) return;
    const group = root.current;
    const controller = new AbortController();
    const { signal } = controller;
    async function prepare() {
      for (const texture of sceneTextures(group)) {
        if (!(await idleTurn(signal))) return;
        gl.initTexture(texture);
      }
      if (!(await idleTurn(signal))) return;
      await gl.compileAsync(group, camera, scene);
      if (signal.aborted) return;
      prepared.current = true;
      recordPreparation(resourceId);
      onPrepared();
      invalidate();
    }
    void prepare().catch((cause: unknown) => {
      if (!signal.aborted) setError(cause);
    });
    return () => controller.abort();
  }, [active, camera, gl, invalidate, onPrepared, root, scene, resourceId]);
  if (error) throw error;
  return null;
}

/** Reveal the Canvas only after its own first prepared frame has been rendered. */
function NotifyRendered({
  active,
  ready,
  onReady,
}: {
  active: boolean;
  ready: boolean;
  onReady: () => void;
}) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    if (!active || !ready) return;
    const initialFrame = gl.info.render.frame;
    const remove = addAfterEffect(() => {
      if (gl.info.render.frame <= initialFrame) return;
      remove();
      onReady();
    });
    invalidate();
    return remove;
  }, [active, gl, invalidate, onReady, ready]);
  return null;
}

export function PreparedModel({
  Scene,
  tier,
  resourceId,
  active,
  animate,
  visible,
  onPrepared,
  onReady,
}: {
  Scene: ComponentType<PlanetSceneProps>;
  tier: TextureTier;
  resourceId: string;
  active: boolean;
  animate: boolean;
  visible: boolean;
  onPrepared: (tier: TextureTier) => void;
  onReady: () => void;
}) {
  const root = useRef<Group>(null);
  const prepared = useCallback(() => onPrepared(tier), [onPrepared, tier]);
  return (
    <TextureTierContext.Provider value={tier}>
      <group ref={root} visible={visible}>
        <Scene active={active && visible} animate={animate && visible} />
        <PrepareScene
          root={root}
          active={active}
          onPrepared={prepared}
          resourceId={resourceId}
        />
        <NotifyRendered active={active} ready={visible} onReady={onReady} />
      </group>
    </TextureTierContext.Provider>
  );
}
