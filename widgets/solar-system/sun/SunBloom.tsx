
"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector2 } from "three";

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const BLOOM_STRENGTH = 0.95;
const BLOOM_THRESHOLD = 1.05;
const BLOOM_RADIUS = 0.50;

export function SunBloom() {
  const { gl, scene, camera, size, viewport } =
    useThree();

  const composerRef =
    useRef<EffectComposer | null>(null);

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

    composer.addPass(
      new RenderPass(scene, camera),
    );

    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    composerRef.current = composer;

    return () => {
      composerRef.current = null;
      composer.dispose();
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;

    composer.setPixelRatio(viewport.dpr);
    composer.setSize(size.width, size.height);
  }, [
    size.width,
    size.height,
    viewport.dpr,
  ]);

  useFrame((state, delta) => {
    const composer = composerRef.current;

    if (composer) {
      composer.render(delta);
    } else {
      state.gl.render(
        state.scene,
        state.camera,
      );
    }
  }, 1);

  return null;
}
