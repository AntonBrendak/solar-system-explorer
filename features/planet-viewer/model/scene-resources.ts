import {
  Texture,
  type Group,
  type Material,
  type Mesh,
  type ShaderMaterial,
  type WebGLRenderer,
} from "three";

export function sceneTextures(root: Group) {
  const textures = new Set<Texture>();
  const collect = (value: unknown) => {
    if (value instanceof Texture) textures.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
  };
  root.traverse((object) => {
    const material = (object as Mesh).material;
    if (!material) return;
    const materials: Material[] = Array.isArray(material)
      ? material
      : [material];
    materials.forEach((item) => {
      Object.values(item).forEach(collect);
      const uniforms = (item as ShaderMaterial).uniforms;
      if (uniforms)
        Object.values(uniforms).forEach((uniform) => collect(uniform.value));
    });
  });
  return textures;
}

// RGBA8-equivalent estimate including mipmaps. Driver allocation is not exposed by WebGL.
export function textureBytes(texture: Texture) {
  const image = texture.image as
    { width?: number; height?: number } | undefined;
  return Math.ceil(
    (image?.width ?? 0) *
      (image?.height ?? 0) *
      4 *
      (texture.generateMipmaps ? 4 / 3 : 1),
  );
}
const roots = new Map<Group, string>();
const preparations: Record<string, number> = {};
const activations: { planetId: string; fullMs: number }[] = [];
export function registerSceneResources(root: Group, id: string) {
  roots.set(root, id);
  return () => {
    roots.delete(root);
  };
}
export function recordPreparation(id: string) {
  preparations[id] = (preparations[id] ?? 0) + 1;
}
export function recordFullActivation(planetId: string, startedAt: number) {
  activations.push({
    planetId,
    fullMs: Math.round(performance.now() - startedAt),
  });
  if (activations.length > 50) activations.shift();
}
function residentTextures(id?: string) {
  const textures = new Set<Texture>();
  roots.forEach((owner, root) => {
    if (!id || owner === id || owner.startsWith(`${id}:`))
      sceneTextures(root).forEach((texture) => textures.add(texture));
  });
  return textures;
}
export function estimatedSceneBytes(id?: string) {
  return [...residentTextures(id)].reduce(
    (sum, texture) => sum + textureBytes(texture),
    0,
  );
}
export function rendererSnapshot(gl: WebGLRenderer) {
  return {
    textures: gl.info.memory.textures,
    residentTextureCount: residentTextures().size,
    geometries: gl.info.memory.geometries,
    programs: gl.info.programs?.length ?? 0,
    estimatedTextureBytes: estimatedSceneBytes(),
    preparations: { ...preparations },
    activations: [...activations],
  };
}
export function residentTextureWidth() {
  return Math.max(
    2048,
    ...[...residentTextures()].map(
      (texture) =>
        (texture.image as { width?: number } | undefined)?.width ?? 0,
    ),
  );
}
