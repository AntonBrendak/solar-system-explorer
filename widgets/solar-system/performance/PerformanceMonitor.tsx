"use client";

import { useContext, useEffect } from "react";
import { RendererTelemetry } from "@/features/planet-viewer";
import { GpuResourceContext } from "@/shared/lib/gpu-resource-context";
import type { PerformanceStore } from "./performance-store";

export function PerformanceMonitor({ store }: { store: PerformanceStore }) {
  const resources = useContext(GpuResourceContext);
  useEffect(() => {
    store.setResourceSnapshot(resources ? resources.snapshot : null);
    return () => store.setResourceSnapshot(null);
  }, [resources, store]);
  return <RendererTelemetry name="map" sink={store.mainSink} />;
}
