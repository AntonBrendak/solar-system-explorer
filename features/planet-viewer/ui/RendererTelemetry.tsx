"use client";

import { useContext, useEffect, useRef } from "react";
import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { createGpuFrameTimer } from "@/shared/lib/gpu-frame-timer";
import { GpuResourceContext } from "@/shared/lib/gpu-resource-context";
import type { RendererTelemetrySink } from "@/shared/lib/renderer-telemetry";

export function RendererTelemetry({
  name,
  sink,
}: {
  name: string;
  sink?: RendererTelemetrySink;
}) {
  const gl = useThree((state) => state.gl);
  const resources = useContext(GpuResourceContext);
  const runtime = useRef({
    started: 0,
    last: 0,
    previousFrame: 0,
    intervals: 0,
    intervalMs: 0,
    frames: 0,
    cpu: 0,
    rendered: false,
    calls: 0,
    triangles: 0,
  });
  const timer = useRef<ReturnType<typeof createGpuFrameTimer> | null>(null);
  const diagnostics = useRef(false);
  useEffect(() => {
    const context = gl.getContext();
    timer.current =
      "createQuery" in context ? createGpuFrameTimer(context) : null;
    diagnostics.current = new URLSearchParams(location.search).has(
      "diagnostics",
    );
    const unregister = resources?.registerRenderer(gl, name);
    const reset = () => {
      runtime.current.last = runtime.current.previousFrame = 0;
    };
    document.addEventListener("visibilitychange", reset);
    return () => {
      timer.current?.dispose();
      unregister?.();
      document.removeEventListener("visibilitychange", reset);
    };
  }, [gl, name, resources]);
  useFrame(() => {
    gl.info.reset();
    if (!sink?.enabled()) return;
    const now = performance.now();
    const state = runtime.current;
    if (state.previousFrame) {
      state.intervals++;
      state.intervalMs += now - state.previousFrame;
    }
    state.previousFrame = now;
    state.started = now;
    state.rendered = true;
    timer.current?.begin();
  }, -100);
  useFrame(() => {
    if (diagnostics.current && name === "map") resources?.recordPresentation();
  }, -1.7);
  useEffect(
    () =>
      addAfterEffect(() => {
        const state = runtime.current;
        timer.current?.end();
        const gpuMs = timer.current?.poll() ?? null;
        if (!sink?.enabled() || document.hidden) {
          state.last =
            state.previousFrame =
            state.frames =
            state.cpu =
            state.intervals =
            state.intervalMs =
              0;
          state.rendered = false;
          return;
        }
        const now = performance.now();
        if (!state.last) state.last = now;
        if (state.rendered) {
          state.frames++;
          state.cpu += now - state.started;
          state.calls = gl.info.render.calls;
          state.triangles = gl.info.render.triangles;
          state.rendered = false;
        }
        const elapsed = now - state.last;
        if (elapsed < 1000) return;
        sink.publish({
          fps: Math.round((state.frames * 1000) / elapsed),
          frameMs: state.intervals ? state.intervalMs / state.intervals : null,
          cpuMs: state.frames ? state.cpu / state.frames : null,
          gpuMs: state.frames ? gpuMs : null,
          calls: state.frames ? state.calls : 0,
          triangles: state.frames ? state.triangles : 0,
          textures: gl.info.memory.textures,
          geometries: gl.info.memory.geometries,
        });
        state.last = now;
        state.frames = state.cpu = state.intervals = state.intervalMs = 0;
      }),
    [gl, sink],
  );
  return null;
}
