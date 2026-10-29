import { createContext } from "react";

export const textureTiers = ["1k", "2k", "4k", "8k"] as const;
export type TextureTier = (typeof textureTiers)[number];
export type QualityPreference = "auto" | TextureTier;
export const TextureTierContext = createContext<TextureTier>("2k");
export type DeviceProfile = {
  memory?: number;
  cores: number;
  saveData: boolean;
  effectiveType?: string;
  downlink?: number;
  hidden: boolean;
};
export type TexturePolicyInput = DeviceProfile & {
  screenWidth: number;
  viewWidth: number;
  viewHeight: number;
  dpr: number;
  maxTextureSize: number;
};

export function getTexturePolicy(input: TexturePolicyInput) {
  const constrained =
    input.saveData ||
    ["slow-2g", "2g", "3g"].includes(input.effectiveType ?? "") ||
    (input.downlink !== undefined && input.downlink < 1.5) ||
    (input.memory !== undefined && input.memory <= 2) ||
    input.maxTextureSize < 2048;
  const base: TextureTier = constrained ? "1k" : "2k";
  const maximum: TextureTier =
    input.maxTextureSize >= 8192
      ? "8k"
      : input.maxTextureSize >= 4096
        ? "4k"
        : input.maxTextureSize >= 2048
          ? "2k"
          : "1k";
  const upgradeDelay =
    input.saveData || ["slow-2g", "2g"].includes(input.effectiveType ?? "")
      ? 5000
      : (input.downlink ?? 10) < 2
        ? 3000
        : 1500;
  return { base, maximum, upgradeDelay };
}

export function clampTier(tier: TextureTier, maximum: TextureTier) {
  return textureTiers[
    Math.min(textureTiers.indexOf(tier), textureTiers.indexOf(maximum))
  ];
}
export function nextTier(
  current: TextureTier | null,
  base: TextureTier,
  target: TextureTier,
) {
  if (!current) return clampTier(base, target);
  const index = textureTiers.indexOf(current),
    last = textureTiers.indexOf(target);
  return last < index ? target : textureTiers[Math.min(index + 1, last)];
}
export type SceneQualityState = {
  tier: TextureTier | null;
  target: TextureTier;
  loading: boolean;
  failed: boolean;
};

export function getTextureBudget(memory?: number) {
  return (
    (memory !== undefined && memory <= 2
      ? 96
      : memory !== undefined && memory <= 4
        ? 160
        : 384) *
    1024 *
    1024
  );
}
