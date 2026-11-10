"use client";

import { useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { GpuResourceContext } from "@/shared/lib/gpu-resource-context";
import { textureAllocationBytes } from "@/shared/lib/gpu-resource-budget";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector2 } from "three";

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const BLOOM_STRENGTH = 0.95;
const BLOOM_THRESHOLD = 1.05;
const BLOOM_RADIUS = 0.5;
const defaultBudget = () => 768 * 1048576;
const unobserved = () => () => {};

export function SunBloom() {
  const { gl, scene, camera, size, viewport } = useThree();

  const composerRef = useRef<EffectComposer | null>(null);
  const bloomRef = useRef<UnrealBloomPass | null>(null);
  const resources = useContext(GpuResourceContext);
  const budget = useSyncExternalStore(
    resources?.subscribeBudget ?? unobserved,
    resources?.getBudget ?? defaultBudget,
    defaultBudget,
  );

  useEffect(() => {
    const composer = new EffectComposer(gl);

    const bloom = new UnrealBloomPass(
      new Vector2(1, 1),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );

    bloom.strength = BLOOM_STRENGTH;
    bloom.threshold = BLOOM_THRESHOLD;
    bloom.radius = BLOOM_RADIUS;

    const render = new RenderPass(scene, camera);
    const output = new OutputPass();
    composer.addPass(render);

    composer.addPass(bloom);
    composer.addPass(output);

    composerRef.current = composer;
    bloomRef.current = bloom;

    return () => {
      composerRef.current = null;
      bloomRef.current = null;
      resources?.release(composer);
      render.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
    };
  }, [gl, scene, camera, resources]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;

    composer.setPixelRatio(viewport.dpr);
    composer.setSize(size.width, size.height);
    const bloom = bloomRef.current;
    const targets = [
      composer.renderTarget1,
      composer.renderTarget2,
      ...(bloom
        ? [
            bloom.renderTargetBright,
            ...bloom.renderTargetsHorizontal,
            ...bloom.renderTargetsVertical,
          ]
        : []),
    ];
    const primary = new Set([composer.renderTarget1, composer.renderTarget2]);
    const storage = (samples: number) =>
      targets.reduce(
        (sum, target) =>
          sum +
          textureAllocationBytes(target.texture) +
          target.width *
            target.height *
            ((primary.has(target) ? samples : target.samples) *
              (8 + (target.depthBuffer ? 4 : 0)) +
              (target.depthBuffer ? 4 : 0)),
        0,
      );
    const allowance = Math.min(192 * 1048576, budget / 4);
    let samples = Math.min(4, gl.capabilities.maxSamples);
    if (storage(samples) > Math.min(96 * 1048576, budget / 8)) samples = 0;
    if (storage(0) > allowance) {
      composer.setPixelRatio(
        viewport.dpr * Math.sqrt(allowance / storage(0)) * 0.98,
      );
    }
    for (const target of primary) {
      if (target.samples !== samples) {
        target.dispose();
        target.samples = samples;
      }
    }
    gl.domElement.setAttribute(
      "data-postprocessing-bytes",
      String(storage(samples)),
    );
    // Include multisampled colour/depth storage as well as the resolved textures.
    const extraBytes = targets.reduce(
      (sum, target) =>
        sum +
        target.width *
          target.height *
          (Math.max(0, target.samples) * 12 + (target.depthBuffer ? 4 : 0)),
      0,
    );
    resources?.acquire(
      composer,
      gl,
      targets.map((target) => target.texture),
      {
        essential: true,
        pinned: true,
        label: "postprocessing",
        extraBytes,
      },
    );
  }, [size.width, size.height, viewport.dpr, gl, resources, budget]);

  useFrame((state, delta) => {
    const composer = composerRef.current;

    if (composer) {
      composer.render(delta);
    } else {
      state.gl.render(state.scene, state.camera);
    }
  }, 1);

  return null;
}
