"use client";

import { createContext } from "react";
import type { GpuResourceBudget } from "./gpu-resource-budget";

export const GpuResourceContext = createContext<GpuResourceBudget | null>(null);
