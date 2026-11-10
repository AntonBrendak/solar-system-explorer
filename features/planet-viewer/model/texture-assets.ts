import manifest from "./texture-manifest.json" with { type: "json" };
import {
  clampTier,
  getTextureBudget,
  getTexturePolicy,
  textureTiers,
  type TexturePolicyInput,
  type TextureTier,
} from "./texture-quality.ts";

/** Conservative RGBA8 + mipmaps estimate; compressed download bytes are not GPU memory. */
export function estimatedPlanetTextureBytes(
  planetId: string,
  tier: TextureTier,
) {
  return Object.entries(manifest)
    .filter(([url]) => url.startsWith(`/textures/${planetId}/`))
    .reduce(
      (sum, [, entry]) =>
        sum + (entry[tier].width * entry[tier].height * 4 * 4) / 3,
      0,
    );
}

export function getModelTextureTarget(
  planetId: string,
  input: TexturePolicyInput,
  pixelDiameter: number,
): TextureTier {
  const policy = getTexturePolicy(input);
  // Surface circumference spans more texels than the visible diameter.
  const texels = Math.max(0, pixelDiameter) * Math.PI;
  const screenTier: TextureTier =
    texels > 4096 ? "8k" : texels > 2048 ? "4k" : texels > 1024 ? "2k" : "1k";
  const deviceTier: TextureTier =
    input.saveData ||
    ["slow-2g", "2g", "3g"].includes(input.effectiveType ?? "") ||
    (input.downlink !== undefined && input.downlink < 1.5) ||
    (input.memory ?? 4) <= 2
      ? "1k"
      : (input.memory ?? 4) <= 4 || input.cores <= 4
        ? "2k"
        : "8k";
  let target = clampTier(
    clampTier(clampTier(screenTier, deviceTier), policy.maximum),
    planetTextureMaximum(planetId),
  );
  // Reserve half the budget for Lite models, previews and overlap during upgrades.
  const budget = getTextureBudget(input.memory) / 2;
  while (
    target !== "1k" &&
    estimatedPlanetTextureBytes(planetId, target) +
      estimatedPlanetTextureBytes(planetId, "2k") >
      budget
  )
    target = textureTiers[textureTiers.indexOf(target) - 1];
  return target;
}

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
