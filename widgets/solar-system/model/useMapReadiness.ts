"use client";

import { useCallback, useEffect, useState } from "react";
import { planetIds } from "@/entities/planet/types";
import { mapLoadingProgress } from "./loading-progress";

type SkyState = {
  uploaded: number;
  total: number;
  ready: boolean;
  error: string | null;
};

/** All initial models must render or provide a local fallback before startup completes. */
export function useMapReadiness() {
  const [sky, setSky] = useState<SkyState>({
    uploaded: 0,
    total: 1000,
    ready: false,
    error: null,
  });

  const [sunReady, setSunReady] = useState(false);
  const [baseSkyReady, setBaseSkyReady] = useState(false);
  const handleBaseSkyReady = useCallback(() => setBaseSkyReady(true), []);
  const [readyModels, setReadyModels] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const markModelReady = useCallback((id: string) => {
    setReadyModels((previous) =>
      previous.has(id) ? previous : new Set(previous).add(id),
    );
  }, []);
  const handleOrbitModelReady = useCallback(
    (id: string) => markModelReady(`orbit:${id}`),
    [markModelReady],
  );
  const handlePreviewReady = useCallback(
    (id: string) => markModelReady(`preview:${id}`),
    [markModelReady],
  );
  const handlePreviewError = useCallback(() => {
    // A lost preview context degrades only the navigation illustrations.
    for (const id of [...planetIds, "sun"]) markModelReady(`preview:${id}`);
  }, [markModelReady]);

  const [showLoader, setShowLoader] = useState(true);

  const handleSkyProgress = useCallback((uploaded: number, total: number) => {
    setSky((previous) =>
      previous.uploaded >= uploaded && previous.total === total
        ? previous
        : {
            ...previous,
            uploaded: Math.max(previous.uploaded, uploaded),
            total,
          },
    );
  }, []);

  const handleSkyReady = useCallback((hasFailures = false) => {
    setSky((previous) =>
      previous.ready && (hasFailures || previous.error === null)
        ? previous
        : {
            ...previous,
            ready: true,
            error: hasFailures ? previous.error : null,
          },
    );
  }, []);

  const handleSkyError = useCallback((error: Error) => {
    setSky((previous) => ({
      ...previous,
      error: error.message,
    }));
  }, []);

  const handleSunReady = useCallback(() => {
    setSunReady(true);
  }, []);

  // Eight Lite orbital models + eight Lite navigation previews + their Sun preview.
  const modelsReady = readyModels.size === planetIds.length * 2 + 1;
  const sceneReady =
    baseSkyReady &&
    sunReady &&
    modelsReady &&
    (sky.ready || sky.error !== null);
  const completedSky = sky.error !== null ? sky.total : sky.uploaded;
  const progress = mapLoadingProgress({
    models: readyModels.size + Number(sunReady),
    modelTotal: planetIds.length * 2 + 2,
    sky: completedSky,
    skyTotal: sky.total,
    ready: sceneReady,
  });

  useEffect(() => {
    if (!sceneReady) return;

    const timer = window.setTimeout(() => {
      setShowLoader(false);
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sceneReady]);

  return {
    sky,
    sunReady,
    readyModels,
    showLoader,
    sceneReady,
    progress,
    handleBaseSkyReady,
    handleOrbitModelReady,
    handlePreviewReady,
    handlePreviewError,
    handleSkyProgress,
    handleSkyReady,
    handleSkyError,
    handleSunReady,
  };
}
