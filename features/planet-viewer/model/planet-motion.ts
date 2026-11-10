"use client";

import { createContext, useContext } from "react";
import type { PlanetRotation } from "@/entities/planet/rotation";

/** Mutable per-frame ephemeris; no React updates or extra WebGL scenes. */
export type PlanetMotion = { date: Date; rotation: PlanetRotation };
export const PlanetMotionContext = createContext<PlanetMotion | null>(null);
export const usePlanetMotion = () => useContext(PlanetMotionContext);
