"use client";

import { useMessages } from "next-intl";
import type { PlanetId, PlanetStory } from "@/entities/planet/types";

export function usePlanetStory(id: PlanetId): PlanetStory {
  const messages = useMessages();
  const story = messages.planets[id];
  return { ...story, chapters: Object.values(story.chapters) };
}
