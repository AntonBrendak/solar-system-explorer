"use client";

import { useContext, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, type PerspectiveCamera } from "three";
import { GpuResourceContext } from "@/shared/lib/gpu-resource-context";
import { coordinateGpuFrameTimers } from "@/shared/lib/gpu-frame-timer";
import { loadManifest } from "./model/sky-manifest";
import { SkyTileScheduler } from "./streaming/SkyTileScheduler";
import type { SkyMetrics } from "./model/sky-types";

type Props = {
  resourcesReady: boolean;
  onReady(): void;
  onState(value: "ready" | "restoring" | "failed"): void;
  onMetrics(value: SkyMetrics): void;
};

export function SkySystem({
  resourcesReady,
  onReady,
  onState,
  onMetrics,
}: Props) {
  const { gl } = useThree();
  const resources = useContext(GpuResourceContext);
  const root = useRef<Group>(null);
  const runtime = useRef<SkyTileScheduler | null>(null);
  const frames = useRef(0);
  const callbacks = useRef({ onReady, onState, onMetrics });
  useEffect(() => {
    callbacks.current = { onReady, onState, onMetrics };
  }, [onReady, onState, onMetrics]);

  useEffect(() => {
    const controller = new AbortController();
    let contextGeneration = 0;
    let manifest: Awaited<ReturnType<typeof loadManifest>> | null = null;
    let retained: ReturnType<SkyTileScheduler["detach"]> | undefined;
    const start = () => {
      if (
        controller.signal.aborted ||
        runtime.current ||
        !manifest ||
        !root.current ||
        gl.getContext().isContextLost()
      )
        return;
      try {
        runtime.current = new SkyTileScheduler(
          gl,
          root.current,
          manifest,
          resources,
          ++contextGeneration,
          {
            ready: () => callbacks.current.onReady(),
            state: (value) => callbacks.current.onState(value),
            metrics: (value) => {
              gl.domElement.dataset.skyStreaming = value.state;
              gl.domElement.dataset.skyRevision = value.revision;
              gl.domElement.dataset.skyBase = String(value.base);
              gl.domElement.dataset.skyPages = String(value.used);
              gl.domElement.dataset.skySlots = String(value.slots);
              gl.domElement.dataset.skyLevel = String(value.visibleLevel);
              gl.domElement.dataset.skyAim = String(value.aimedLevel);
              gl.domElement.dataset.skyCoverage = String(value.coverageReady);
              gl.domElement.dataset.skyTarget = String(value.coverageTarget);
              gl.domElement.dataset.skyCap = String(value.capBytes);
              callbacks.current.onMetrics(value);
            },
          },
          retained,
        );
        retained = undefined;
      } catch (error) {
        console.warn("Sky initialization failed", error);
        callbacks.current.onState("failed");
        callbacks.current.onReady();
      }
    };
    const lost = (event: Event) => {
      event.preventDefault();
      contextGeneration++;
      callbacks.current.onState("restoring");
      if (runtime.current) retained = runtime.current.detach();
      runtime.current = null;
    };
    const restored = () => {
      start();
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    gl.domElement.addEventListener("webglcontextrestored", restored);
    void loadManifest(controller.signal)
      .then((value) => {
        manifest = value;
        start();
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Sky revision unavailable", error);
        callbacks.current.onState("failed");
        callbacks.current.onReady();
      });
    return () => {
      controller.abort();
      gl.domElement.removeEventListener("webglcontextlost", lost);
      gl.domElement.removeEventListener("webglcontextrestored", restored);
      runtime.current?.dispose();
      runtime.current = null;
      retained?.loader.dispose();
      coordinateGpuFrameTimers(
        gl.getContext() as WebGL2RenderingContext,
        false,
      );
    };
  }, [gl, resources]);

  useFrame(() => {
    // Reserve occasional frames for the Sky draw query before RendererTelemetry begins its query.
    coordinateGpuFrameTimers(
      gl.getContext() as WebGL2RenderingContext,
      ++frames.current % 60 === 0,
    );
  }, -101);
  useFrame(({ camera, size }) => {
    try {
      runtime.current?.tick(
        camera as PerspectiveCamera,
        size.height * gl.getPixelRatio(),
        performance.now(),
        resourcesReady,
      );
    } catch (error) {
      console.warn("Sky streaming stopped safely", error);
      runtime.current?.dispose();
      runtime.current = null;
      callbacks.current.onState("failed");
      callbacks.current.onReady();
    }
  }, 0);
  return <group ref={root} />;
}
