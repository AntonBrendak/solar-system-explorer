import {
  FloatType,
  HalfFloatType,
  type Texture,
  type WebGLRenderer,
} from "three";

export function textureAllocationBytes(texture: Texture): number {
  const image = texture.image as
    { width?: number; height?: number; depth?: number } | undefined;
  const channels =
    texture.type === FloatType ? 16 : texture.type === HalfFloatType ? 8 : 4;
  return Math.ceil(
    (image?.width ?? 0) *
      (image?.height ?? 0) *
      (image?.depth ?? 1) *
      channels *
      (texture.generateMipmaps ? 4 / 3 : 1),
  );
}

type LeaseOptions = {
  label?: string;
  pinned?: boolean;
  essential?: boolean;
  extraBytes?: number;
  evict?: () => void;
  presented?: () => boolean;
};
type Lease = LeaseOptions & {
  renderer: object;
  textures: Set<Texture>;
  usedAt: number;
};

/** Shared admission control. Texture identities are deduplicated per WebGL context,
 * but a texture uploaded to both contexts counts twice. Bytes remain an estimate;
 * renderer counters report the actual number of allocated GPU objects.
 */
export function createGpuResourceBudget(initialBudget: number) {
  let budgetBytes = initialBudget;
  let baseBudget = initialBudget;
  const allowances = new Map<object, number>();
  let tick = 0;
  let evictions = 0;
  const leases = new Map<object, Lease>();
  const budgetListeners = new Set<() => void>();
  const renderers = new Map<
    object,
    { name: string; renderer: WebGLRenderer }
  >();
  const presentationIssues: string[] = [];
  let presentationFrames = 0;
  const presentedPlanets = new Set<string>();
  const allocatedBytes = () => {
    const contexts = new Map<object, Set<Texture>>();
    let bytes = 0;
    for (const lease of leases.values()) {
      bytes += lease.extraBytes ?? 0;
      const textures = contexts.get(lease.renderer) ?? new Set<Texture>();
      for (const texture of lease.textures) {
        if (!textures.has(texture)) bytes += textureAllocationBytes(texture);
        textures.add(texture);
      }
      contexts.set(lease.renderer, textures);
    }
    return bytes;
  };
  const trim = (protectedOwner?: object) => {
    const inactive = [...leases.entries()]
      .filter(
        ([owner, lease]) =>
          owner !== protectedOwner && !lease.pinned && lease.evict,
      )
      .sort(([, a], [, b]) => a.usedAt - b.usedAt);
    for (const [owner, lease] of inactive) {
      if (allocatedBytes() <= budgetBytes) break;
      leases.delete(owner);
      lease.evict?.();
      evictions++;
    }
  };
  return {
    getBudget: () => budgetBytes,
    subscribeBudget(listener: () => void) {
      budgetListeners.add(listener);
      return () => {
        budgetListeners.delete(listener);
      };
    },
    setBudget(bytes: number) {
      baseBudget = bytes;
      const next = Math.max(baseBudget, ...allowances.values());
      const changed = budgetBytes !== next;
      budgetBytes = next;
      trim();
      if (changed) budgetListeners.forEach((listener) => listener());
    },
    setAllowance(owner: object, bytes: number) {
      if (bytes) allowances.set(owner, bytes);
      else allowances.delete(owner);
      const next = Math.max(baseBudget, ...allowances.values());
      if (next === budgetBytes) return;
      budgetBytes = next;
      trim();
      budgetListeners.forEach((listener) => listener());
    },
    acquire(
      owner: object,
      renderer: object,
      textures: Iterable<Texture>,
      options: LeaseOptions = {},
    ) {
      const previous = leases.get(owner);
      leases.set(owner, {
        ...options,
        renderer,
        textures: new Set(textures),
        usedAt: ++tick,
      });
      trim(owner);
      if (!options.essential && allocatedBytes() > budgetBytes) {
        if (previous) leases.set(owner, previous);
        else leases.delete(owner);
        return false;
      }
      return true;
    },
    touch(owner: object, pinned: boolean, used = pinned) {
      const lease = leases.get(owner);
      if (!lease) return;
      lease.pinned = pinned;
      if (used) lease.usedAt = ++tick;
    },
    release(owner: object) {
      leases.delete(owner);
    },
    registerRenderer(renderer: WebGLRenderer, name: string) {
      renderers.set(renderer, { renderer, name });
      return () => {
        renderers.delete(renderer);
        for (const [owner, lease] of leases) {
          if (lease.renderer === renderer) leases.delete(owner);
        }
      };
    },
    recordPresentation() {
      presentationFrames++;
      const visible = new Map<string, number>();
      for (const lease of leases.values()) {
        if (!lease.presented || !lease.label?.startsWith("orbit:")) continue;
        const planet = lease.label.split(":")[1];
        visible.set(
          planet,
          (visible.get(planet) ?? 0) + Number(lease.presented()),
        );
      }
      for (const [planet, count] of visible) {
        if (count > 1 && presentationIssues.length < 20)
          presentationIssues.push(`${planet}: ${count} visible layers`);
        if (
          count === 0 &&
          presentedPlanets.has(planet) &&
          presentationIssues.length < 20
        )
          presentationIssues.push(`${planet}: empty frame`);
        if (count > 0) presentedPlanets.add(planet);
      }
    },
    snapshot() {
      return {
        budgetBytes,
        estimatedBytes: allocatedBytes(),
        evictions,
        leases: leases.size,
        presentationFrames,
        presentationIssues: [...presentationIssues],
        models: [...leases.values()]
          .filter((lease) => lease.presented)
          .map((lease) => ({
            label: lease.label,
            visible: lease.presented!(),
          })),
        renderers: [...renderers.values()].map(({ renderer, name }) => ({
          name,
          textures: renderer.info.memory.textures,
          geometries: renderer.info.memory.geometries,
        })),
      };
    },
  };
}

export type GpuResourceBudget = ReturnType<typeof createGpuResourceBudget>;
