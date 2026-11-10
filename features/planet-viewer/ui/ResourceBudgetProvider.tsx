"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createGpuResourceBudget } from "@/shared/lib/gpu-resource-budget";
import { GpuResourceContext } from "@/shared/lib/gpu-resource-context";
import { getTextureBudget } from "../model/texture-quality";
import { useDeviceProfile } from "../model/useDeviceProfile";

export function ResourceBudgetProvider({ children }: { children: ReactNode }) {
  // One total allowance for a map plus its preview renderer, not a per-model allowance.
  const [resources] = useState(() =>
    createGpuResourceBudget(getTextureBudget() * 2),
  );
  const profile = useDeviceProfile();
  useEffect(
    () => resources.setBudget(getTextureBudget(profile.memory) * 2),
    [profile.memory, resources],
  );
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("diagnostics")) return;
    const target = window as Window & {
      __ORBITAL_MAP_RESOURCES__?: typeof resources;
    };
    target.__ORBITAL_MAP_RESOURCES__ = resources;
    return () => {
      delete target.__ORBITAL_MAP_RESOURCES__;
    };
  }, [resources]);
  return (
    <GpuResourceContext.Provider value={resources}>
      {children}
    </GpuResourceContext.Provider>
  );
}
