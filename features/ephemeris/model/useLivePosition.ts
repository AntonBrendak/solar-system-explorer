"use client";

import { useEffect, useState } from "react";
import type { PlanetId } from "@/entities/planet/types";
import type { PlanetPosition } from "@/entities/planet/position";

export function useLivePosition(id: PlanetId, active: boolean) {
  const [position, setPosition] = useState<PlanetPosition | null>(null);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    const update = async () => {
      if (document.hidden) return;
      const { getPlanetPosition } = await import("@/entities/planet/position");
      if (!disposed) setPosition(getPlanetPosition(id, new Date()));
    };
    void update();
    const timer = window.setInterval(() => void update(), 60000);
    document.addEventListener("visibilitychange", update);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [id, active]);
  return position?.id === id ? position : null;
}
