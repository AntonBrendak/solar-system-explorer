import manifest from "./texture-manifest.json";
import { textureTiers, type TextureTier } from "./texture-quality";

export function planetTextureMaximum(planetId: string): TextureTier {
  const width = Math.max(
    1024,
    ...Object.entries(manifest)
      .filter(([url]) => url.startsWith(`/textures/${planetId}/`))
      .map(([, asset]) => asset["8k"].width),
  );
  return width >= 8192
    ? "8k"
    : width >= 4096
      ? "4k"
      : width >= 2048
        ? "2k"
        : "1k";
}
export function gpuTextureMaximum(limit: number): TextureTier {
  return (
    [...textureTiers]
      .reverse()
      .find((tier) => Number.parseInt(tier) * 1024 <= limit) ?? "1k"
  );
}
