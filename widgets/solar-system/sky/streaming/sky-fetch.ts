import type { SkyAsset } from "../model/sky-manifest";
import { SkyAssetError } from "./SkyRequestPolicy.ts";

export async function fetchSkyAsset(
  url: string,
  asset: SkyAsset,
  signal: AbortSignal,
  schedule?: <T>(work: () => T) => Promise<T>,
  onProgress?: (loaded: number) => void,
): Promise<Blob> {
  const response = await fetch(url, { signal, cache: "force-cache" });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const retryable =
      [408, 425, 429].includes(response.status) || response.status >= 500;
    const value = response.headers.get("retry-after");
    const delay = value
      ? /^\d+$/.test(value)
        ? Number(value) * 1000
        : Math.max(0, Date.parse(value) - Date.now())
      : 0;
    throw new SkyAssetError(
      `Sky HTTP ${response.status}`,
      retryable ? "transient" : "permanent",
      delay || 0,
    );
  }
  const length = Number(response.headers.get("content-length"));
  if (
    length &&
    !response.headers.get("content-encoding") &&
    length !== asset.bytes
  ) {
    await response.body?.cancel();
    throw new SkyAssetError("Sky asset length mismatch", "permanent");
  }
  const bytes = schedule
    ? await schedule(() => new Uint8Array(asset.bytes))
    : new Uint8Array(asset.bytes);
  const reader = response.body?.getReader();
  if (!reader) throw new SkyAssetError("Sky response has no body", "transient");
  let offset = 0;
  let lastProgress = -Infinity;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > bytes.length)
        throw new SkyAssetError(
          "Sky asset exceeds manifest length",
          "permanent",
        );
      if (schedule) {
        for (let chunk = 0; chunk < value.length; chunk += 256 * 1024) {
          const part = value.subarray(
            chunk,
            Math.min(value.length, chunk + 256 * 1024),
          );
          const destination = offset + chunk;
          await schedule(() => bytes.set(part, destination));
        }
      } else bytes.set(value, offset);
      offset += value.length;
      if (
        onProgress &&
        (offset === asset.bytes || performance.now() - lastProgress >= 100)
      ) {
        lastProgress = performance.now();
        onProgress(offset);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (offset !== asset.bytes)
    throw new SkyAssetError("Sky asset is truncated", "permanent");
  const hash = () => crypto.subtle.digest("SHA-256", bytes);
  const digestBytes = schedule ? await schedule(hash) : await hash();
  const digest = Array.from(new Uint8Array(digestBytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== asset.sha256)
    throw new SkyAssetError("Sky asset SHA-256 mismatch", "permanent");
  signal.throwIfAborted();
  return schedule
    ? schedule(() => new Blob([bytes], { type: "image/webp" }))
    : new Blob([bytes], { type: "image/webp" });
}
