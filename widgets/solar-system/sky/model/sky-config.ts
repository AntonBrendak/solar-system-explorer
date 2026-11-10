import type { PageCore } from "./sky-types";

export const MiB = 1024 * 1024;
export const SKY_CAP = 256 * MiB;
export const SKY_RESERVE = Math.ceil(SKY_CAP * 0.15);
export const SKY_USABLE = SKY_CAP - SKY_RESERVE;
export const NETWORK_CORE = 2048;
export const GUTTER = 2;
export const NETWORK_PHYSICAL = NETWORK_CORE + 2 * GUTTER;
export const DECODE_PEAK = NETWORK_PHYSICAL ** 2 * 12;
export const PAGE_PROFILES: readonly PageCore[] = [1024, 512, 256];
export const BLEND_MS = 400;
export const IDLE_MS = 400;
export const CANCEL_GRACE_MS = 500;
export const MAIN_THREAD_MS = 1;

export function chooseBaseSize(input: {
  maxTextureSize: number;
  ceiling: number;
  cpuBytes: number;
  gpuBytes: number;
  globalFree: number;
  streamingFree: number;
  usable?: number;
}) {
  const usable = input.usable ?? SKY_USABLE;
  const candidates = [8192, 4096, 2048].filter(
    (size) =>
      size <= input.maxTextureSize &&
      size <= input.ceiling &&
      ((size * size) / 2) * 12 + input.cpuBytes <= usable &&
      baseBytes(size) <= Math.min(usable - input.gpuBytes, input.globalFree),
  );
  const groupBytes = pageBytes(1024) * 4;
  return (
    candidates.find(
      (size) => baseBytes(size) + groupBytes <= input.streamingFree,
    ) ??
    candidates.find((size) => baseBytes(size) <= input.streamingFree) ??
    candidates.find((size) => size === 2048)
  );
}

export function physical(core: PageCore) {
  return core + 2 * GUTTER;
}
export function pageBytes(core: PageCore) {
  return physical(core) ** 2 * 4;
}
export function baseBytes(width: number, mipmaps = true) {
  let bytes = 0;
  for (
    let w = width, h = width / 2;
    ;
    w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)
  ) {
    bytes += w * h * 4;
    if (!mipmaps || (w === 1 && h === 1)) return bytes;
  }
}
