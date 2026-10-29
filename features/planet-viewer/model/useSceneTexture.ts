"use client";

import { useContext, useEffect } from "react";
import { useLoader } from "@react-three/fiber";
import { TextureLoader, type Texture } from "three";
import manifest from "./texture-manifest.json";
import { TextureTierContext, type TextureTier } from "./texture-quality";

const failedUrls = new Set<string>();
const batches = new Map<string, string[]>();
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
  batches.forEach((urls, key) => {
    if (!urls.some((url) => failedUrls.has(url))) return;
    useLoader.clear(SceneTextureLoader, urls);
    batches.delete(key);
  });
  failedUrls.clear();
}

const owners = new Map<Texture, number>();
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
  }
}

export function useSceneTexture(url: string): Texture;
export function useSceneTexture(url: string[]): Texture[];
export function useSceneTexture(url: string | string[]): Texture | Texture[] {
  const tier = useContext(TextureTierContext);
  const mapped = Array.isArray(url)
    ? url.map((item) => resolveTextureUrl(item, tier))
    : resolveTextureUrl(url, tier);
  const key = JSON.stringify(mapped);
  batches.set(key, Array.isArray(mapped) ? mapped : [mapped]);
  const result = useLoader(SceneTextureLoader, mapped);
  useEffect(() => {
    const textures = Array.isArray(result) ? result : [result];
    textures.forEach(retain);
    return () => textures.forEach(release);
  }, [key, result]);
  // Unlike drei/useTexture, do not eagerly upload unused originals of cloned maps.
  return result;
}
