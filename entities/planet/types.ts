export const planetIds = [
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
] as const;
export type PlanetId = (typeof planetIds)[number];
export type PlanetStory = {
  name: string;
  category: string;
  headline: string;
  introduction: string;
  chapters: { title: string; text: string }[];
  discovery: string;
};
export type PlanetRecord = {
  id: PlanetId;
  number: string;
  accent: string;
  image: string;
  kind: "terrestrial" | "gas" | "ice";
  diameterKm: number;
  massKg: number;
  distanceMillionKm: number;
  orbitDays: number;
  rotationHours: number;
  axialTilt: number;
  source: string;
};
export function isPlanetId(value: unknown): value is PlanetId {
  return typeof value === "string" && planetIds.some((id) => id === value);
}
