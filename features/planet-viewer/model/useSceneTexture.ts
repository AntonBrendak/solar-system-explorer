"use client";

import { createContext, useContext, useEffect } from "react";
import { useLoader } from "@react-three/fiber";
import { TextureLoader, type Texture } from "three";
import manifest from "./texture-manifest.json";
import { TextureTierContext, type TextureTier } from "./texture-quality";
import { textureAllocationBytes } from "@/shared/lib/gpu-resource-budget";

const failedUrls = new Set<string>();
type TextureBatch = { urls: string[]; textures: Texture[]; lastUsed: number };
const batches = new Map<string, TextureBatch>();
const INACTIVE_DECODED_BUDGET = 64 * 1024 * 1024;
let evictionTask: ReturnType<typeof setTimeout> | null = null;
/** Opt-in source aliases let shared Lite geometry use the map's fixed texture tier. */
export const TextureSourceContext = createContext<Readonly<
  Record<string, string>
> | null>(null);
class SceneTextureLoader extends TextureLoader {
  override load(
    url: string,
    onLoad?: (texture: Texture<HTMLImageElement>) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ) {
    return super.load(url, onLoad, onProgress, (error) => {
      failedUrls.add(url);
      onError?.(error);
    });
  }
}
type TextureEntry = Record<
  TextureTier,
  { url: string; width: number; height: number; bytes: number }
>;
export function resolveTextureUrl(url: string, tier: TextureTier) {
  return (manifest as Record<string, TextureEntry>)[url]?.[tier].url ?? url;
}
export function retryFailedTextures() {
  batches.forEach((batch, key) => {
    if (!batch.urls.some((url) => failedUrls.has(url))) return;
    useLoader.clear(SceneTextureLoader, batch.urls);
    batches.delete(key);
  });
  failedUrls.clear();
}

const owners = new Map<Texture, number>();
function rememberBatch(key: string, urls: string[]) {
  if (!batches.has(key))
    batches.set(key, { urls, textures: [], lastUsed: Infinity });
}

function retainBatch(key: string, textures: Texture[]) {
  const batch = batches.get(key);
  if (batch) {
    batch.textures = textures;
    batch.lastUsed = performance.now();
  }
  textures.forEach(retain);
  return () => {
    if (batch) batch.lastUsed = performance.now();
    textures.forEach(release);
  };
}
function trimInactiveBatches() {
  const inactive = [...batches.entries()]
    .filter(
      ([, batch]) =>
        batch.textures.length &&
        !batch.textures.some((texture) => owners.has(texture)),
    )
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
  let bytes = inactive.reduce(
    (sum, [, batch]) =>
      sum +
      batch.textures.reduce(
        (n, texture) => n + textureAllocationBytes(texture),
        0,
      ),
    0,
  );
  for (const [key, batch] of inactive) {
    if (bytes <= INACTIVE_DECODED_BUDGET) break;
    // A just-rendered Suspense tree may not have committed its ownership effect yet.
    if (performance.now() - batch.lastUsed < 1000) continue;
    useLoader.clear(SceneTextureLoader, batch.urls);
    batches.delete(key);
    bytes -= batch.textures.reduce(
      (sum, texture) => sum + textureAllocationBytes(texture),
      0,
    );
  }
}
function retain(texture: Texture) {
  owners.set(texture, (owners.get(texture) ?? 0) + 1);
}
function release(texture: Texture) {
  const count = (owners.get(texture) ?? 1) - 1;
  if (count > 0) owners.set(texture, count);
  else {
    owners.delete(texture);
    // Keep the decoded loader result for a later visit, release its GPU allocation.
    texture.dispose();
    trimInactiveBatches();
    if (evictionTask === null)
      evictionTask = setTimeout(() => {
        evictionTask = null;
        trimInactiveBatches();
      }, 1100);
  }
}

export function useSceneTexture(url: string): Texture;
export function useSceneTexture(url: string[]): Texture[];
export function useSceneTexture(url: string | string[]): Texture | Texture[] {
  const tier = useContext(TextureTierContext);
  const sources = useContext(TextureSourceContext);
  const resolve = (item: string) =>
    resolveTextureUrl(sources?.[item] ?? item, tier);
  const mapped = Array.isArray(url) ? url.map(resolve) : resolve(url);
  const key = JSON.stringify(mapped);
  rememberBatch(key, Array.isArray(mapped) ? mapped : [mapped]);
  const result = useLoader(SceneTextureLoader, mapped);
  useEffect(() => {
    const textures = Array.isArray(result) ? result : [result];
    return retainBatch(key, textures);
  }, [key, result]);
  // Unlike drei/useTexture, do not eagerly upload unused originals of cloned maps.
  return result;
}
