import { MiB } from "./sky-config.ts";

/** Declared application limits from coarse device hints, never free-VRAM measurements. */
export function skyResourcePolicy(input: {
  memory?: number;
  cores: number;
  saveData: boolean;
  maxTextureSize: number;
  maxArrayLayers: number;
  experimentalMiB?: number;
}) {
  const capable =
    (input.memory ?? 0) >= 8 &&
    input.cores >= 8 &&
    !input.saveData &&
    input.maxTextureSize >= 8192 &&
    input.maxArrayLayers >= 256;
  const explicit = [256, 512, 1024].includes(input.experimentalMiB ?? 0)
    ? input.experimentalMiB
    : undefined;
  return {
    capBytes: (explicit ?? (capable ? 512 : 256)) * MiB,
    mode: explicit
      ? "explicit experimental allowance"
      : capable
        ? "automatic desktop allowance"
        : "conservative allowance",
  };
}
