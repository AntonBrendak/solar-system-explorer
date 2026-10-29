"use client";

import type { Locale } from "@/i18n/config";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPlanetId, type PlanetId } from "@/entities/planet/types";

export type CardOrigin = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function useExplorer(
  initialLocale: Locale,
  initialPlanet: PlanetId | null,
  initialFocus: PlanetId = "mercury",
) {
  const [locale, setLocale] = useState(initialLocale);
  const [selected, setSelected] = useState<PlanetId | null>(initialPlanet);
  const [focused, setFocused] = useState<PlanetId>(
    initialPlanet ?? initialFocus,
  );
  const [motionPaused, setMotionPaused] = useState(false);
  const [origin, setOrigin] = useState<CardOrigin | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const openedFromPage = useRef(false);
  const closingLocale = useRef<Locale | null>(null);
  const closingFocus = useRef<PlanetId | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      if (closingLocale.current) {
        params.set("lang", closingLocale.current);
        if (closingFocus.current) params.set("focus", closingFocus.current);
        const url = new URL(window.location.href);
        url.search = params.toString();
        window.history.replaceState({}, "", url);
        closingLocale.current = null;
        closingFocus.current = null;
      }
      setLocale(
        params.get("lang") === "en"
          ? "en"
          : params.get("lang") === "ru"
            ? "ru"
            : initialLocale,
      );
      const planet = params.get("planet");
      setSelected(isPlanetId(planet) ? planet : null);
      const focus = params.get("focus");
      setFocused(
        isPlanetId(planet) ? planet : isPlanetId(focus) ? focus : "mercury",
      );
      openedFromPage.current = false;
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [initialLocale]);

  const openPlanet = useCallback((planet: PlanetId, element?: HTMLElement) => {
    trigger.current =
      element ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const rect = element?.getBoundingClientRect();
    setOrigin(
      rect
        ? {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }
        : null,
    );
    const url = new URL(window.location.href);
    url.searchParams.set("planet", planet);
    window.history.pushState({}, "", url);
    openedFromPage.current = true;
    setSelected(planet);
    setFocused(planet);
  }, []);

  const closePlanet = useCallback(() => {
    setSelected(null);
    if (openedFromPage.current) {
      closingLocale.current = locale;
      closingFocus.current = focused;
      window.history.back();
      openedFromPage.current = false;
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete("planet");
      url.searchParams.set("focus", focused);
      window.history.replaceState({}, "", url);
    }
    window.requestAnimationFrame(() =>
      trigger.current?.focus({ preventScroll: true }),
    );
  }, [locale, focused]);

  const changePlanet = useCallback((planet: PlanetId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("planet", planet);
    window.history.replaceState({}, "", url);
    setSelected(planet);
    setFocused(planet);
  }, []);

  const focusPlanet = useCallback((planet: PlanetId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("focus", planet);
    window.history.replaceState({}, "", url);
    setFocused(planet);
  }, []);

  const changeLocale = useCallback((next: Locale) => {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState({}, "", url);
    document.cookie = `ORBITAL_LOCALE=${next};path=/;max-age=31536000;SameSite=Lax`;
    setLocale(next);
  }, []);

  return {
    locale,
    selected,
    focused,
    focusPlanet,
    motionPaused,
    origin,
    openPlanet,
    closePlanet,
    changePlanet,
    changeLocale,
    setMotionPaused,
  };
}
