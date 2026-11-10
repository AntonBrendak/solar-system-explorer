import lock from "./sky-atlas.lock.json";
import coverage from "./sky-coverage.lock.json";
import type { NetworkTile } from "./sky-types";

export type SkyAsset = {
  path: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
};
export type SkyManifest = {
  schema: 2;
  revision: string;
  projection: "equirectangular-ICRF-J2000";
  colorSpace: "srgb";
  orientation: "top-down";
  core: 2048;
  gutter: 2;
  files: Record<string, SkyAsset>;
};
export const atlasLock = lock;

export async function sha256(data: ArrayBuffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function loadManifest(signal: AbortSignal): Promise<SkyManifest> {
  if (!lock.revision)
    throw new Error("Sky atlas is not prepared; run npm run prepare:sky");
  const response = await fetch(`${lock.root}/manifest.json`, {
    signal,
    cache: "force-cache",
  });
  if (!response.ok) throw new Error(`Sky manifest: HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Sky manifest has no body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024)
        throw new Error("Sky manifest exceeds its reservation");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const bytes = data.buffer;
  if ((await sha256(bytes)) !== lock.manifestSha256)
    throw new Error("Sky manifest hash mismatch");
  const manifest = JSON.parse(new TextDecoder().decode(bytes)) as SkyManifest;
  if (
    manifest.schema !== 2 ||
    manifest.revision !== lock.revision ||
    manifest.projection !== "equirectangular-ICRF-J2000" ||
    manifest.colorSpace !== "srgb" ||
    manifest.orientation !== "top-down" ||
    manifest.core !== 2048 ||
    manifest.gutter !== 2
  ) {
    throw new Error("Incompatible Sky revision");
  }
  const required = ["reserve", "base-2k", "base-4k", "base-8k"];
  for (const level of [16, 32, 64]) {
    for (let row = 0; row < level / 4; row++) {
      for (let col = 0; col < level / 2; col++)
        required.push(`${level}/${row}/${col}`);
    }
  }
  if (required.some((key) => !manifest.files[key]))
    throw new Error("Incomplete Sky revision");
  if (
    coverage.parameters.parentRevision !== manifest.revision ||
    !coverage.validation.decodedPixelsMatchSource
  )
    throw new Error("Incompatible Sky coverage supplement");
  for (const [key, asset] of Object.entries(coverage.files))
    manifest.files[key] = { ...asset, path: `${coverage.root}/${asset.path}` };
  manifest.revision += `:${coverage.revision}`;
  return manifest;
}
export function tileKey(tile: NetworkTile) {
  return `${tile.level}/${tile.row}/${tile.column}`;
}
