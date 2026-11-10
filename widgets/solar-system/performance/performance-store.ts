import type {
  RendererSample,
  RendererTelemetrySink,
} from "@/shared/lib/renderer-telemetry";
import type { GpuResourceBudget } from "@/shared/lib/gpu-resource-budget";
import type { SkyMetrics } from "../sky/model/sky-types";

export type PerformanceSample = {
  map: RendererSample | null;
  previews: RendererSample | null;
  heapMb: number | null;
  sky: SkyMetrics | null;
  resources: ReturnType<GpuResourceBudget["snapshot"]> | null;
};

/** Only diagnostics subscribe; neither telemetry stream rerenders the scene. */
export function createPerformanceStore() {
  let sample: PerformanceSample | null = null;
  let expanded = false;
  let sky: SkyMetrics | null = null;
  let resourceSnapshot: (() => PerformanceSample["resources"]) | null = null;
  const listeners = new Set<() => void>();
  const publish = (renderer: "map" | "previews", value: RendererSample) => {
    const memory = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    sample = {
      map: sample?.map ?? null,
      previews: sample?.previews ?? null,
      [renderer]: value,
      heapMb: memory ? memory.usedJSHeapSize / 1024 / 1024 : null,
      resources: resourceSnapshot?.() ?? null,
      sky,
    };
    listeners.forEach((listener) => listener());
  };
  const mainSink: RendererTelemetrySink = {
    enabled: () => expanded,
    publish: (value) => publish("map", value),
  };
  const previewSink: RendererTelemetrySink = {
    enabled: () => expanded,
    publish: (value) => publish("previews", value),
  };
  return {
    mainSink,
    previewSink,
    publishSky(value: SkyMetrics) {
      sky = value;
      if (!expanded || !sample) return;
      sample = { ...sample, sky };
      listeners.forEach((listener) => listener());
    },
    getSnapshot: () => sample,
    getServerSnapshot: () => null,
    setExpanded(value: boolean) {
      expanded = value;
    },
    setResourceSnapshot(read: typeof resourceSnapshot) {
      resourceSnapshot = read;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export type PerformanceStore = ReturnType<typeof createPerformanceStore>;
