import {
  Matrix4,
  Vector2,
  type DataTexture,
  type Group,
  type PerspectiveCamera,
  type WebGLRenderer,
} from "three";
import type { GpuResourceBudget } from "@/shared/lib/gpu-resource-budget";
import {
  baseBytes,
  chooseBaseSize,
  BLEND_MS,
  DECODE_PEAK,
  IDLE_MS,
  MiB,
  MAIN_THREAD_MS,
  PAGE_PROFILES,
  pageBytes,
  physical,
  SKY_CAP,
} from "../model/sky-config";
import { type SkyManifest, tileKey } from "../model/sky-manifest";
import { skyResourcePolicy } from "../model/sky-resource-policy";
import type {
  GpuPage,
  LodTransitionGroup,
  SkyMetrics,
  SkyRegion,
  PageCore,
} from "../model/sky-types";
import { baseTexture, SkySphere } from "../rendering/SkySphere";
import { SkyPageTable } from "../rendering/SkyPageTable";
import { SkyMemory } from "./SkyMemory";
import { SkyTileLoader } from "./SkyTileLoader";
import { SkyGpuPool, type SkySlot } from "./SkyGpuPool";
import { viewportCoverageBudget } from "./ViewportCoverageBudget";
import {
  contains,
  regionKey,
  describeGroup,
  appendGroupPages,
  type SkyLodPlan,
  SkyLodSelector,
  detailRegions,
} from "./SkyLodSelector";

type Transition = {
  group: LodTransitionGroup | null;
  next: SkySlot[];
  retired: SkySlot[];
  phase: "table" | "blend";
  started: number;
};

const resident = (slot: SkySlot | undefined): slot is SkySlot =>
  !!slot && ["GPU uploaded", "Published", "Visible"].includes(slot.state);
type Callbacks = {
  ready(): void;
  state(value: "ready" | "restoring" | "failed"): void;
  metrics(value: SkyMetrics): void;
};

/** Owns mutable runtime state. React sees startup/context events and one diagnostic sample per second. */
export class SkyTileScheduler {
  readonly cpu: SkyMemory;
  readonly gpu: SkyMemory;
  private reserveBytes: number;
  private capBytes: number;
  readonly loader: SkyTileLoader;
  private sphere: SkySphere | null = null;
  private reserve: DataTexture | null = null;
  private base: DataTexture | null = null;
  private baseKey = "reserve";
  private pool: SkyGpuPool | null = null;
  private table: SkyPageTable | null = null;
  private shown: SkySlot[] = [];
  private group: LodTransitionGroup | null = null;
  private transition: Transition | null = null;
  private selector = new SkyLodSelector();
  private regions: SkyRegion[] = detailRegions();
  private coverageTarget = 4;
  private coverageBudget: ReturnType<typeof viewportCoverageBudget> | null =
    null;
  private detailLimit = 4;
  private coverageFade: { started: number } | null = null;
  private notified = false;
  private bootstrapTarget = 4;
  private allocationPolicy: ReturnType<typeof skyResourcePolicy>;
  private policyReadyAt = performance.now() + 4000;
  private policyApplied = false;
  private blockedBy = "Preparing initial coverage";
  private coverageReady = 4;
  private requirements: SkyLodPlan["requirements"] = [];
  private matrix = new Matrix4();
  private previousView = new Matrix4();
  private previousCamera = new Matrix4();
  private previousProjection = new Matrix4();
  private viewGeneration = 0;
  private poolGeneration = 0;
  private lastSelection = -Infinity;
  private lastMotion = 0;
  private lastFrame = 0;
  private frame = 0;
  private pauseUntil = 0;
  private interval = 1;
  private stableSince = 0;
  private slowUploads = 0;
  private profileIndex = 0;
  private lastMetrics = 0;
  private warmFence: WebGLSync | null = null;
  private warming = false;
  private ready = false;
  private disposed = false;
  private leases = new Map<object, number>();
  private safetyOwner = {};
  private baseSize = 0;
  private baseLimit = 4096;
  private baseSourceFence: WebGLSync | null = null;
  private compressedHeadroom: number;
  private baseRetirement: {
    texture: DataTexture;
    key: string;
    fence: WebGLSync;
  } | null = null;
  private nextProfile = 0;
  private lastPoolAttempt = -Infinity;
  private poolCeiling = Infinity;
  private error: string | null = null;
  private lastUseful = new Map<string, number>();
  private selectionScan: {
    leaves: SkyRegion[];
    core: PageCore;
    plan: SkyLodPlan;
    cursor: number;
    coverageReady: number;
    blockedAt: number;
    bootstrapBlockedAt: number;
    best: LodTransitionGroup | null;
    priority: number;
  } | null = null;
  private warmRequested = false;
  private warmStarted = 0;
  private warmupMs: number | null = null;
  private cpuPeakMs = 0;

  constructor(
    private renderer: WebGLRenderer,
    private root: Group,
    manifest: SkyManifest,
    private resources: GpuResourceBudget | null,
    private contextGeneration: number,
    private callbacks: Callbacks,
    retained?: { cpu: SkyMemory; loader: SkyTileLoader; capBytes?: number },
  ) {
    const context = renderer.getContext() as WebGL2RenderingContext;
    if (!context.fenceSync) throw new Error("Sky requires WebGL2");
    const device = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const query = new URLSearchParams(location.search);
    this.allocationPolicy = skyResourcePolicy({
      memory: device.deviceMemory,
      cores: device.hardwareConcurrency,
      saveData: !!device.connection?.saveData,
      maxTextureSize: renderer.capabilities.maxTextureSize,
      maxArrayLayers: context.getParameter(context.MAX_ARRAY_TEXTURE_LAYERS),
      experimentalMiB: query.has("diagnostics")
        ? Number(query.get("skyMemory"))
        : undefined,
    });
    this.capBytes = retained?.capBytes ?? SKY_CAP;
    this.reserveBytes = Math.ceil(this.capBytes * 0.15);
    const usable = this.capBytes - this.reserveBytes;
    if (this.capBytes > SKY_CAP)
      resources?.setAllowance(this, this.capBytes * 2);
    if (retained)
      this.policyApplied = this.capBytes >= this.allocationPolicy.capBytes;
    this.cpu = retained?.cpu ?? new SkyMemory(usable);
    this.gpu = new SkyMemory(usable);
    if (
      resources &&
      !resources.acquire(this.safetyOwner, renderer, [], {
        label: "sky:safety-reserve",
        extraBytes: this.reserveBytes,
        pinned: true,
      })
    )
      throw new Error("Map resource budget cannot reserve Sky safety margin");
    this.loader = retained?.loader ?? new SkyTileLoader(manifest, this.cpu);
    this.compressedHeadroom =
      2 *
        Math.max(
          ...Object.entries(manifest.files)
            .filter(([key]) => /^\d+\//.test(key))
            .map(([, asset]) => asset.bytes),
        ) +
      MiB;
  }

  private admit(owner: object, bytes: number) {
    const reservation = this.gpu.reserve(bytes, "GPU resources");
    if (reservation === null) return false;
    if (
      this.resources &&
      !this.resources.acquire(owner, this.renderer, [], {
        label: "sky:managed",
        extraBytes: bytes,
        pinned: true,
      })
    ) {
      this.gpu.release(reservation);
      return false;
    }
    this.leases.set(owner, reservation);
    return true;
  }
  private release(owner: object) {
    const reservation = this.leases.get(owner);
    if (reservation !== undefined) this.gpu.release(reservation);
    this.leases.delete(owner);
    this.resources?.release(owner);
  }

  private availableGlobalBytes() {
    const global = this.resources?.snapshot();
    // Full-model policy allows a transition peak of one quarter of the map's
    // combined budget. Do not fill that unallocated headroom with a pinned pool.
    return global
      ? Math.max(0, global.budgetBytes * 0.75 - global.estimatedBytes)
      : this.gpu.limit;
  }

  tick(
    camera: PerspectiveCamera,
    pixelHeight: number,
    now: number,
    resourcesReady = true,
  ) {
    const started = performance.now();
    try {
      this.tickFrame(
        camera,
        pixelHeight,
        now,
        started + MAIN_THREAD_MS,
        resourcesReady,
      );
    } finally {
      this.cpuPeakMs = Math.max(this.cpuPeakMs, performance.now() - started);
    }
  }
  private tickFrame(
    camera: PerspectiveCamera,
    pixelHeight: number,
    now: number,
    deadline: number,
    resourcesReady: boolean,
  ) {
    if (this.disposed || this.renderer.getContext().isContextLost()) return;
    this.frame++;
    this.root.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    const projectionChanged = !camera.projectionMatrix.equals(
      this.previousProjection,
    );
    const cameraDelta = camera.matrixWorld.elements.reduce(
      (sum, value, index) =>
        sum + Math.abs(value - this.previousCamera.elements[index]),
      0,
    );
    if (cameraDelta > 0.001 || projectionChanged || !this.lastFrame) {
      this.lastMotion = now;
      this.previousCamera.copy(camera.matrixWorld);
      this.previousProjection.copy(camera.projectionMatrix);
    }
    this.matrix.multiplyMatrices(
      camera.matrixWorldInverse,
      this.root.matrixWorld,
    );
    if (!this.matrix.equals(this.previousView) || projectionChanged) {
      // Floating astronomical rotations should not mark every frame as camera motion.
      const delta = this.matrix.elements.reduce(
        (sum, value, i) =>
          sum + Math.abs(value - this.previousView.elements[i]),
        0,
      );
      if (delta > 0.001 || projectionChanged || !this.lastFrame) {
        this.viewGeneration++;
        this.previousView.copy(this.matrix);
      }
    }
    const idle = now - this.lastMotion >= IDLE_MS;
    const frameMs = this.lastFrame ? now - this.lastFrame : 16;
    this.lastFrame = now;
    const overloaded = this.notified && frameMs > 25 && frameMs < 1000;
    if (overloaded) this.pauseUntil = Math.max(this.pauseUntil, now + 100);
    const mayWork = !document.hidden && now >= this.pauseUntil && !overloaded;
    if (this.baseSourceFence) {
      const context = this.renderer.getContext() as WebGL2RenderingContext;
      const status = context.clientWaitSync(this.baseSourceFence, 0, 0);
      if (status === context.WAIT_FAILED)
        throw new Error("Sky base upload confirmation failed");
      if (status !== context.TIMEOUT_EXPIRED) {
        context.deleteSync(this.baseSourceFence);
        this.baseSourceFence = null;
        this.releaseBaseSource();
      }
    }
    if (this.baseRetirement) {
      const context = this.renderer.getContext() as WebGL2RenderingContext;
      const status = context.clientWaitSync(this.baseRetirement.fence, 0, 0);
      if (status === context.TIMEOUT_EXPIRED) return;
      if (status === context.WAIT_FAILED)
        throw new Error("Sky base retirement failed");
      context.deleteSync(this.baseRetirement.fence);
      this.baseRetirement.texture.dispose();
      this.release(this.baseRetirement.texture);
      this.loader.cache.delete(this.baseRetirement.key);
      this.baseRetirement = null;
      this.base = null;
      this.baseSize = 0;
      this.baseKey = "reserve";
      this.baseLimit = 2048;
      this.warming = false;
    }
    const useful = new Set<string>(["reserve", this.baseKey]);
    if (this.pool?.pendingTileKey) useful.add(this.pool.pendingTileKey);
    if (!this.reserve) useful.add("reserve");
    if (this.group)
      for (const tile of this.group.tiles) useful.add(tileKey(tile));

    // Bootstrap also uses the worker, but is permitted to finish under the initial loader.
    if (!this.reserve)
      this.loader.want("reserve", this.viewGeneration, now, deadline);
    this.loader.tick(
      useful,
      this.viewGeneration,
      now,
      mayWork || !this.ready,
      idle || !this.ready,
      deadline,
    );
    if (this.warmRequested && performance.now() < deadline)
      this.beginWarmup(deadline);
    if (performance.now() < deadline) this.sphere?.pumpWarm(deadline);
    if (!this.reserve) {
      if (performance.now() >= deadline) return;
      const pixels = this.loader.cache.get("reserve");
      if (!pixels && this.loader.unavailable("reserve"))
        throw new Error(this.loader.error ?? "Sky reserve is unavailable");
      if (pixels) {
        if (this.renderer.capabilities.maxTextureSize < 256)
          throw new Error("Sky reserve exceeds GPU texture limit");
        const texture = baseTexture(pixels);
        if (!this.admit(texture, baseBytes(256) + 256 * 1024)) {
          texture.dispose();
          throw new Error("Sky reserve admission failed");
        }
        this.reserve = texture;
        this.renderer.initTexture(texture);
        const context = this.renderer.getContext() as WebGL2RenderingContext;
        if (context.getError() !== context.NO_ERROR)
          throw new Error("Sky reserve GPU upload failed");
        this.sphere = new SkySphere(this.renderer, texture, this.cpu);
        this.sphere.material.uniforms.detailLimit.value = 4;
        this.sphere.material.uniforms.previousDetailLimit.value = 4;
        this.root.add(this.sphere.mesh);
      }
      if (performance.now() < deadline) this.diagnostics(now);
      return;
    }
    if (!this.base && !this.warming) {
      // Essential model/preview leases must be known before sizing optional Sky resources.
      if (!resourcesReady) return;
      if ((this.ready && !idle) || performance.now() >= deadline) return;
      const global = this.resources?.snapshot();
      const width = chooseBaseSize({
        maxTextureSize: this.renderer.capabilities.maxTextureSize,
        ceiling: this.baseLimit,
        cpuBytes: this.cpu.bytes,
        gpuBytes: this.gpu.bytes,
        globalFree: global
          ? Math.max(0, global.budgetBytes - global.estimatedBytes)
          : this.gpu.limit,
        streamingFree: this.availableGlobalBytes(),
        usable: Math.min(this.cpu.limit, this.gpu.limit),
      });
      if (!width) {
        this.beginWarmup(deadline);
        return;
      }
      this.baseKey = `base-${width / 1024}k`;
      this.loader.want(this.baseKey, this.viewGeneration, now, deadline);
      const pixels = this.loader.cache.get(this.baseKey);
      if (pixels && performance.now() < deadline) {
        const texture = baseTexture(pixels);
        const admitted = this.admit(texture, baseBytes(width));
        const context = this.renderer.getContext() as WebGL2RenderingContext;
        if (admitted) this.renderer.initTexture(texture);
        if (admitted && context.getError() === context.NO_ERROR) {
          this.base = texture;
          this.baseSize = width;
          this.sphere!.material.uniforms.skyBase.value = texture;
          if (this.ready) {
            this.baseSourceFence = context.fenceSync(
              context.SYNC_GPU_COMMANDS_COMPLETE,
              0,
            );
            if (!this.baseSourceFence)
              throw new Error("Sky base source fence unavailable");
            context.flush();
          }
          this.beginWarmup(deadline);
        } else {
          if (admitted) this.release(texture);
          texture.dispose();
          this.loader.cache.delete(this.baseKey);
          this.baseKey = "reserve";
          this.baseLimit = width / 2;
          if (width === 2048) this.beginWarmup(deadline);
        }
      }
      // Loader errors cannot leave startup waiting forever: reserve is independently valid.
      if (this.loader.unavailable(this.baseKey) && !this.loader.requests.size)
        this.beginWarmup(deadline);
      if (performance.now() < deadline) this.diagnostics(now);
      return;
    }
    if (this.warmFence && !this.ready) {
      const context = this.renderer.getContext() as WebGL2RenderingContext;
      const status = context.clientWaitSync(this.warmFence, 0, 0);
      if (status !== context.TIMEOUT_EXPIRED) {
        context.deleteSync(this.warmFence);
        this.warmFence = null;
        if (status === context.WAIT_FAILED)
          throw new Error("Sky warmup failed");
        this.ready = true;
        this.warmupMs = performance.now() - this.warmStarted;
        this.sphere!.mesh.visible = true;
        this.releaseBaseSource();
        // Allocate the fixed array while startup/recovery is still covered by the loader.
        this.lastPoolAttempt = now;
        this.poolRequested = true;
      }
    }
    if (!this.ready) return;
    this.selector.update(camera, this.root.matrixWorld);
    if (this.poolRequested && performance.now() < deadline) {
      this.poolRequested = false;
      this.createPool(camera, pixelHeight, deadline);
    }
    if (
      !this.pool &&
      idle &&
      mayWork &&
      performance.now() < deadline &&
      now - this.lastPoolAttempt >= 1000
    ) {
      this.lastPoolAttempt = now;
      this.createPool(camera, pixelHeight, deadline);
    }
    const pool = this.pool;
    if (!pool || !this.table) {
      if (!this.poolRequested) this.notifyReady();
      if (performance.now() < deadline) this.diagnostics(now);
      return;
    }
    pool.poll((page) => this.pageUseful(page));
    if (pool.error || this.table.error) {
      // A failed fence cannot authorize slot reuse. Keep allocations quarantined and draw the base.
      this.sphere!.material.uniforms.detailsEnabled.value = 0;
      this.group = null;
      this.transition = null;
      this.coverageTarget = this.coverageReady = 4;
      this.notifyReady();
      if (performance.now() < deadline) this.diagnostics(now);
      return;
    }
    this.updateTransition(now, mayWork, deadline);
    if (this.coverageFade) {
      const blend = Math.min(1, (now - this.coverageFade.started) / BLEND_MS);
      this.sphere!.material.uniforms.coverageBlend.value = blend;
      if (blend === 1) this.coverageFade = null;
    }
    if (
      !this.coverageFade &&
      this.coverageReady >= this.coverageTarget &&
      this.aimedLevel() >= this.bootstrapTarget
    )
      this.notifyReady();
    if (
      this.group &&
      !this.transition &&
      this.group.tiles.some((tile) => this.loader.unavailable(tileKey(tile)))
    ) {
      pool.cancelQueued();
      if (!pool.busy) {
        pool.retire(
          this.group.pages.flatMap((page) => {
            const slot = pool.find(page);
            return slot && !this.shown.includes(slot) ? [slot] : [];
          }),
        );
        for (const tile of this.group.tiles) this.loader.cancel(tileKey(tile));
        this.group = null;
        this.selectionScan = null;
      }
    }
    if (
      now - this.lastSelection >= 100 &&
      !this.transition &&
      !this.resetProfile
    ) {
      if (this.select(camera, pixelHeight, now, mayWork, deadline))
        this.lastSelection = now;
    }
    if (
      this.group &&
      !this.transition &&
      !this.resetProfile &&
      performance.now() < deadline
    ) {
      const group = this.group;
      const keys = new Set(group.tiles.map(tileKey));
      for (const key of keys) useful.add(key);
      this.loader.setUseful(useful);
      if (mayWork) {
        for (const tile of group.tiles) {
          if (performance.now() >= deadline) break;
          const pages = group.pages.filter((page) => page.tile.id === tile.id);
          const complete = pages.every((page) => resident(pool.find(page)));
          if (complete) {
            this.loader.cache.delete(tileKey(tile));
            continue;
          }
          this.loader.want(tileKey(tile), this.viewGeneration, now, deadline);
          const pixels = this.loader.cache.get(tileKey(tile));
          if (!pixels || pool.busy) continue;
          const page = pages.find((item) => !pool.find(item));
          if (page) pool.queue(page, pixels);
        }
      }
      if (performance.now() >= deadline) return;
      const uploaded = group.pages.map((page) => pool.find(page));
      if (!pool.busy && uploaded.every(resident) && this.groupUseful(group)) {
        const replaced = this.shown.filter(
          (slot) =>
            slot.page &&
            contains(group.region, slot.page.tile) &&
            slot.page.tile.level === group.target &&
            !uploaded.includes(slot),
        );
        const next = [
          ...new Set(
            this.shown
              .filter((slot) => !replaced.includes(slot))
              .concat(uploaded as SkySlot[]),
          ),
        ];
        if (mayWork && performance.now() < deadline)
          this.stage(next, replaced, group);
      }
    }
    if (
      mayWork &&
      performance.now() < deadline &&
      this.frame % this.interval === 0 &&
      (!this.slowUploads || idle || pool.core < 1024)
    ) {
      const submitted = pool.work(deadline, true);
      if (submitted && pool.lastUploadMs > 2) {
        this.pauseUntil = Math.max(this.pauseUntil, now + 250);
        this.interval = Math.min(8, this.interval * 2);
        this.slowUploads++;
        this.stableSince = now;
      } else if (submitted && now - this.stableSince > 3000) {
        this.interval = Math.max(1, this.interval / 2);
        this.stableSince = now;
      }
    }
    // Profile changes preserve logical regions. Release the old pool only after a fenced base-only table.
    if (
      this.resetProfile &&
      !this.transition &&
      !pool.busy &&
      pool.free === pool.slots.length
    ) {
      this.destroyPool();
      this.profileIndex = this.nextProfile;
      this.slowUploads = 0;
      this.resetProfile = false;
      this.coverageReady = 4;
      return;
    }
    if (
      this.slowUploads >= 3 &&
      idle &&
      !this.resetProfile &&
      !this.transition &&
      this.profileIndex < PAGE_PROFILES.length - 1
    ) {
      this.dropToBase();
    }
    if (performance.now() < deadline) this.diagnostics(now);
  }

  private poolRequested = false;
  private beginWarmup(deadline: number) {
    this.warmRequested = true;
    if (performance.now() >= deadline) return;
    this.warmRequested = false;
    if (this.warming || !this.sphere) return;
    this.warming = true;
    if (this.ready) return;
    this.warmStarted = performance.now();
    void this.sphere
      .warm()
      .then((fence) => {
        if (this.disposed)
          (this.renderer.getContext() as WebGL2RenderingContext).deleteSync(
            fence,
          );
        else this.warmFence = fence;
      })
      .catch((error: unknown) => {
        if (!this.disposed) {
          this.error = error instanceof Error ? error.message : String(error);
          this.callbacks.state("failed");
          this.callbacks.ready();
        }
      });
  }

  /** GPU-only bases keep their mip chain but release decoded RAM after confirmed submission.
   * Context recovery owns a new texture and reacquires the immutable file through the loader. */
  private releaseBaseSource() {
    if (!this.base) return;
    this.base.source.dataReady = false;
    this.base.image.data = new Uint8Array(0);
    this.loader.cache.delete(this.baseKey);
  }

  private notifyReady() {
    if (this.notified) return;
    this.notified = true;
    this.callbacks.ready();
    this.callbacks.state("ready");
  }

  private poolPlanningIndex: number | null = null;
  private aimedLevel() {
    return Math.max(
      4,
      ...this.shown
        .filter((slot) => slot.page && this.selector.aimed(slot.page.tile))
        .map((slot) => slot.page!.tile.level),
    );
  }
  private applyAllocationPolicy() {
    if (this.policyApplied) return true;
    if (performance.now() < this.policyReadyAt) {
      this.poolRequested = true;
      return false;
    }
    this.policyApplied = true;
    const cap = this.allocationPolicy.capBytes;
    if (cap <= this.capBytes) return true;
    this.resources?.setAllowance(this, cap * 2);
    const reserve = Math.ceil(cap * 0.15);
    if (
      this.resources &&
      !this.resources.acquire(this.safetyOwner, this.renderer, [], {
        label: "sky:safety-reserve",
        extraBytes: reserve,
        pinned: true,
      })
    ) {
      this.resources.setAllowance(this, 0);
      this.blockedBy = "Shared map budget";
      return true;
    }
    this.capBytes = cap;
    this.reserveBytes = reserve;
    this.cpu.limit = this.gpu.limit = cap - reserve;
    return true;
  }
  private createPool(
    camera: PerspectiveCamera,
    pixelHeight: number,
    deadline: number,
  ) {
    if (!this.sphere || !this.loader.detailStreamingEnabled) return;
    if (!this.applyAllocationPolicy()) return;
    const context = this.renderer.getContext() as WebGL2RenderingContext;
    const maxLayers = context.getParameter(
      context.MAX_ARRAY_TEXTURE_LAYERS,
    ) as number;
    const maxSize = this.renderer.capabilities.maxTextureSize;
    for (
      let i = this.poolPlanningIndex ?? this.profileIndex;
      i < PAGE_PROFILES.length;
      i++
    ) {
      const core = PAGE_PROFILES[i];
      if (physical(core) > maxSize) continue;
      const width = 65536 / core;
      const tables = ((width * width * 15) / 16) * 16 * 2;
      const bytesPerPage = pageBytes(core);
      const available = this.availableGlobalBytes();
      let count = Math.min(
        maxLayers,
        512,
        Math.floor(this.poolCeiling / bytesPerPage),
        Math.floor((this.gpu.limit - this.gpu.bytes - tables) / bytesPerPage),
        Math.floor((available - tables) / bytesPerPage),
        Math.floor(
          (this.cpu.limit -
            this.cpu.bytes -
            DECODE_PEAK -
            this.compressedHeadroom -
            tables) /
            bytesPerPage,
        ),
      );
      const minimumGroup = (2048 / core) ** 2;
      if (count < minimumGroup) continue;
      const plan = this.selector.plan(
        camera,
        pixelHeight,
        core,
        count,
        deadline,
      );
      if (!plan) {
        this.poolPlanningIndex = i;
        this.poolRequested = true;
        return;
      }
      this.poolPlanningIndex = null;
      this.coverageTarget = plan.coverage;
      this.coverageBudget = plan.budget;
      this.requirements = plan.requirements;
      count = Math.min(count, plan.budget.capacity);
      this.bootstrapTarget = Math.min(
        plan.refinement,
        plan.coverage * 2 ** Math.floor(plan.budget.cachePages / minimumGroup),
      );
      if (count < minimumGroup) continue;
      const owner = {};
      if (!this.admit(owner, count * bytesPerPage + tables)) continue;
      try {
        this.pool = new SkyGpuPool(
          this.renderer,
          this.cpu,
          core,
          count,
          this.loader.manifest.revision,
          this.contextGeneration,
          ++this.poolGeneration,
        );
        this.table = new SkyPageTable(core, this.cpu);
        // Store the broker reservation on the pool's stable identity.
        this.leases.set(this.pool, this.leases.get(owner)!);
        this.leases.delete(owner);
        this.poolOwner = owner;
        this.profileIndex = i;
        const uniforms = this.sphere.material.uniforms;
        uniforms.skyPages.value = this.pool.texture;
        uniforms.previousTable.value = uniforms.nextTable.value =
          this.table.current;
        uniforms.pageCore.value = core;
        uniforms.tableSize.value = new Vector2(
          this.table.width,
          this.table.height,
        );
        uniforms.detailsEnabled.value = 1;
        return;
      } catch (error) {
        this.pool?.dispose();
        this.pool = null;
        this.table?.dispose(this.renderer);
        this.table = null;
        this.release(owner);
        this.error = error instanceof Error ? error.message : String(error);
        this.poolCeiling = Math.min(
          this.poolCeiling,
          (count * bytesPerPage) / 2,
        );
      }
    }
  }
  private poolOwner: object | null = null;

  private groupUseful(group: LodTransitionGroup) {
    return group.tiles.some((tile) => this.selector.useful(tile));
  }
  private pageUseful(page: GpuPage) {
    return (
      !!this.transition?.next.some((slot) => slot.page?.id === page.id) ||
      (!!this.group?.pages.some((item) => item.id === page.id) &&
        this.groupUseful(this.group)) ||
      this.shown.some((slot) => slot.page?.id === page.id)
    );
  }
  private select(
    camera: PerspectiveCamera,
    pixelHeight: number,
    now: number,
    mayWork: boolean,
    deadline: number,
  ): boolean {
    const pool = this.pool!;
    if (this.coverageFade) return true;
    if (this.group) {
      if (this.groupUseful(this.group)) {
        this.unwantedSince = 0;
        return true;
      }
      if (!this.unwantedSince) this.unwantedSince = now;
      if (now - this.unwantedSince < 500) return true;
      pool.cancelQueued();
      if (pool.busy) return true;
      pool.retire(
        this.group.pages.flatMap((page) => {
          const slot = pool.find(page);
          return slot && !this.shown.includes(slot) ? [slot] : [];
        }),
      );
      for (const tile of this.group.tiles) this.loader.cancel(tileKey(tile));
      this.group = null;
    }
    if (!mayWork) return true;
    if (performance.now() >= deadline) return false;
    if (
      !this.selectionScan ||
      this.selectionScan.leaves !== this.regions ||
      this.selectionScan.core !== pool.core
    ) {
      const plan = this.selector.plan(
        camera,
        pixelHeight,
        pool.core,
        pool.slots.length,
        deadline,
      );
      if (!plan) return false;
      this.coverageTarget = plan.coverage;
      this.coverageBudget = plan.budget;
      this.requirements = plan.requirements;
      this.selectionScan = {
        leaves: this.regions,
        core: pool.core,
        plan,
        cursor: 0,
        coverageReady: plan.coverage,
        blockedAt: Infinity,
        bootstrapBlockedAt: Infinity,
        best: null,
        priority: -Infinity,
      };
    }
    const scan = this.selectionScan;
    while (scan.cursor < scan.leaves.length && performance.now() < deadline) {
      const leaf = scan.leaves[scan.cursor++];
      if (!this.selector.useful(leaf)) continue;
      const missing = !this.shown.some(
        (slot) => slot.page?.tile.id === regionKey(leaf),
      );
      if (
        missing &&
        leaf.level <= scan.plan.coverage &&
        this.selector.useful(leaf, false)
      )
        scan.coverageReady = Math.min(scan.coverageReady, leaf.level / 2);
      if (!missing || leaf.level > scan.plan.refinement) continue;
      if (leaf.level > scan.plan.coverage) {
        const parent = {
          level: leaf.level / 2,
          row: Math.floor(leaf.row / 2),
          column: Math.floor(leaf.column / 2),
        } as SkyRegion;
        if (
          this.coverageReady < scan.plan.coverage ||
          !this.shown.some((slot) => slot.page?.tile.id === regionKey(parent))
        )
          continue;
      }
      const candidate = describeGroup(leaf);
      if (
        candidate.tiles.some((tile) =>
          this.loader.unavailable(tileKey(tile)),
        ) ||
        !this.groupUseful(candidate)
      ) {
        if (
          leaf.level <= scan.plan.coverage &&
          this.selector.useful(leaf, false)
        )
          scan.blockedAt = Math.min(scan.blockedAt, leaf.level);
        if (this.selector.aimed(leaf))
          scan.bootstrapBlockedAt = Math.min(
            scan.bootstrapBlockedAt,
            leaf.level,
          );
        continue;
      }
      const priority = this.selector.priority(candidate.region);
      const best = scan.best;
      const floor = Math.max(8, scan.plan.coverage);
      const category = (item: LodTransitionGroup) =>
        this.selector.useful(item.region, false)
          ? Number(item.target > floor)
          : 2;
      const rank = best
        ? category(candidate) - category(best) ||
          (category(candidate) === 0 && category(best) === 0
            ? candidate.target - best.target
            : 0)
        : -1;
      if (!best || rank < 0 || (rank === 0 && priority > scan.priority)) {
        scan.best = candidate;
        scan.priority = priority;
      }
    }
    if (scan.cursor < scan.leaves.length || performance.now() >= deadline)
      return false;
    this.coverageReady = scan.coverageReady;
    this.coverageTarget = Math.min(scan.plan.coverage, scan.blockedAt / 2);
    this.bootstrapTarget = Math.min(
      this.bootstrapTarget,
      scan.blockedAt / 2,
      scan.bootstrapBlockedAt / 2,
    );
    const displayLimit =
      this.coverageReady >= this.coverageTarget
        ? scan.plan.refinement
        : this.coverageReady;
    if (displayLimit !== this.detailLimit) {
      const uniforms = this.sphere!.material.uniforms;
      uniforms.previousDetailLimit.value = this.detailLimit;
      this.detailLimit = displayLimit;
      uniforms.detailLimit.value = this.detailLimit;
      uniforms.coverageBlend.value = 0;
      this.coverageFade = { started: now };
      this.selectionScan = null;
      return true;
    }
    const residentLimit =
      scan.plan.budget.workingPages + scan.plan.budget.cachePages;
    if (this.shown.length > residentLimit && !pool.busy) {
      const offscreen = this.shown.find(
        (slot) => slot.page && !this.selector.useful(slot.page.tile, false),
      );
      if (offscreen?.page && performance.now() < deadline) {
        const id = offscreen.page.tile.id;
        const retired = this.shown.filter((slot) => slot.page?.tile.id === id);
        this.stage(
          this.shown.filter((slot) => !retired.includes(slot)),
          retired,
          null,
        );
        return true;
      }
    }
    const candidate = scan.best;
    if (!candidate || !this.groupUseful(candidate)) {
      this.blockedBy = "Screen-space quality target";
      this.selectionScan = null;
      return true;
    }
    const skyCost = this.sphere?.timer.poll();
    if (
      this.notified &&
      skyCost !== null &&
      skyCost !== undefined &&
      skyCost > 4
    ) {
      this.blockedBy = "Sky shader cost";
      this.selectionScan = null;
      return true;
    }
    const reusable = pool.slots.filter(
      (slot) =>
        resident(slot) &&
        candidate.tiles.some((tile) => tile.id === slot.page?.tile.id),
    ).length;
    const required =
      candidate.tiles.length * (2048 / pool.core) ** 2 - reusable;
    if (
      !this.selector.useful(candidate.region, false) &&
      pool.free - required < scan.plan.budget.transitionPages
    ) {
      this.blockedBy = "Transition headroom";
      this.selectionScan = null;
      return true;
    }
    const available =
      candidate.target > scan.plan.coverage
        ? Math.max(0, pool.free - scan.plan.budget.transitionPages)
        : pool.free;
    if (required > available) {
      this.blockedBy =
        available < pool.free ? "Transition headroom" : "GPU pool capacity";
      if (!this.notified && this.selector.aimed(candidate.region))
        this.bootstrapTarget = this.aimedLevel();
      this.selectionScan = null;
      const unused = this.shown.filter(
        (slot) => slot.page && !this.selector.useful(slot.page.tile, false),
      );
      if (unused.length && !pool.busy) {
        unused.sort(
          (a, b) =>
            (this.lastUseful.get(a.page!.tile.id) ?? 0) -
            (this.lastUseful.get(b.page!.tile.id) ?? 0),
        );
        const id = unused[0].page!.tile.id;
        const retired = this.shown.filter((slot) => slot.page!.tile.id === id);
        if (performance.now() < deadline)
          this.stage(
            this.shown.filter((slot) => !retired.includes(slot)),
            retired,
            null,
          );
      } else if (!pool.busy) {
        const peripheral = this.shown.filter(
          (slot) =>
            slot.page &&
            slot.page.tile.level > Math.max(8, scan.plan.coverage) &&
            !contains(slot.page.tile, candidate.region) &&
            !this.selector.aimed(slot.page.tile) &&
            (candidate.target <= scan.plan.coverage ||
              this.selector.priority(slot.page.tile) + 0.02 <
                this.selector.priority(candidate.region)),
        );
        peripheral.sort(
          (a, b) =>
            this.selector.priority(a.page!.tile) -
            this.selector.priority(b.page!.tile),
        );
        const region = peripheral[0]?.page?.tile;
        if (region && performance.now() < deadline) {
          const retired = this.shown.filter(
            (slot) => slot.page && contains(region, slot.page.tile),
          );
          this.stage(
            this.shown.filter((slot) => !retired.includes(slot)),
            retired,
            null,
          );
        }
      }
      return true;
    }
    if (
      !appendGroupPages(candidate, pool.core, deadline) ||
      performance.now() >= deadline
    )
      return false;
    const sourcePages = this.shown
      .filter(
        (slot) =>
          slot.page &&
          (contains(candidate.region, slot.page.tile) ||
            contains(slot.page.tile, candidate.region)),
      )
      .map((slot) => slot.page!.id);
    candidate.currentCoverage = sourcePages.length
      ? { kind: "pages", pageIds: sourcePages }
      : { kind: "base" };
    this.group = candidate;
    this.blockedBy = "Streaming";
    this.selectionScan = null;
    this.unwantedSince = 0;
    for (const slot of this.shown)
      if (slot.page && this.selector.useful(slot.page.tile))
        this.lastUseful.set(slot.page.tile.id, now);
    return true;
  }
  private unwantedSince = 0;
  private resetProfile = false;

  private stage(
    next: SkySlot[],
    retired: SkySlot[],
    group: LodTransitionGroup | null,
  ) {
    if (!this.table?.stage(this.renderer, next)) return;
    this.selectionScan = null;
    this.transition = { group, next, retired, phase: "table", started: 0 };
  }
  private updateTransition(now: number, mayWork: boolean, deadline: number) {
    const transition = this.transition;
    if (!transition || !this.table || !this.pool || !this.sphere) return;
    const uniforms = this.sphere.material.uniforms;
    if (transition.phase === "table") {
      if (
        mayWork &&
        performance.now() < deadline &&
        this.table.work(this.renderer, deadline) &&
        this.table.lastUploadMs > 2
      ) {
        this.pauseUntil = Math.max(this.pauseUntil, now + 250);
      }
      if (!this.table.poll(this.renderer)) return;
      // viewGeneration is deliberately absent: reevaluate usefulness of the spatial region.
      if (transition.group && !this.groupUseful(transition.group)) {
        // The complete transition remains protected until the table is discarded at this frame boundary.
        this.pool.retire(
          transition.next.filter((slot) => !this.shown.includes(slot)),
        );
        this.table.discard();
        this.transition = null;
        this.group = null;
        return;
      }
      transition.phase = "blend";
      transition.started = now;
      for (const slot of transition.next) slot.state = "Published";
      uniforms.previousTable.value = this.table.current;
      uniforms.nextTable.value = this.table.next;
    }
    uniforms.transition.value = Math.min(
      1,
      (now - transition.started) / BLEND_MS,
    );
    if (uniforms.transition.value < 1) return;
    this.table.commit();
    uniforms.previousTable.value = uniforms.nextTable.value =
      this.table.current;
    uniforms.transition.value = 0;
    this.shown = transition.next;
    for (const slot of this.shown) slot.state = "Visible";
    this.pool.retire(transition.retired);
    this.group = null;
    this.transition = null;
    if (this.resetProfile) this.pool.retire(this.pool.slots);
  }
  private dropToBase(reduceProfile = true) {
    if (this.pool?.busy) return;
    this.group = null;
    this.resetProfile = true;
    this.nextProfile = this.profileIndex + Number(reduceProfile);
    this.stage([], this.shown, null);
  }
  private destroyPool() {
    if (!this.sphere) return;
    const uniforms = this.sphere.material.uniforms;
    this.detailLimit = this.coverageReady = 4;
    this.coverageFade = null;
    uniforms.detailLimit.value = uniforms.previousDetailLimit.value = 4;
    uniforms.coverageBlend.value = 1;
    uniforms.detailsEnabled.value = 0;
    uniforms.skyPages.value = this.sphere.dummyPages;
    uniforms.previousTable.value = uniforms.nextTable.value =
      this.sphere.dummyTable;
    if (this.pool) {
      const reservation = this.leases.get(this.pool);
      if (reservation !== undefined) this.gpu.release(reservation);
      this.leases.delete(this.pool);
      this.pool.dispose();
    }
    if (this.poolOwner) this.resources?.release(this.poolOwner);
    this.poolOwner = null;
    this.selectionScan = null;
    this.table?.dispose(this.renderer);
    this.table = null;
    this.pool = null;
    this.shown = [];
  }

  private diagnostics(now: number) {
    if (now - this.lastMetrics < 1000) return;
    this.lastMetrics = now;
    const global = this.resources?.snapshot();
    if (
      this.ready &&
      global &&
      global.estimatedBytes > global.budgetBytes &&
      !this.transition &&
      !this.resetProfile
    ) {
      if (this.pool) this.dropToBase(false);
      else if (this.base && this.baseSize > 2048 && !this.baseRetirement) {
        // Keep the small permanent base visible while releasing the previous base's last readers.
        const context = this.renderer.getContext() as WebGL2RenderingContext;
        this.sphere!.material.uniforms.skyBase.value = this.reserve;
        const fence = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!fence) throw new Error("Sky base replacement fence failed");
        context.flush();
        this.baseRetirement = { texture: this.base, key: this.baseKey, fence };
      }
    }
    this.callbacks.metrics({
      revision: this.loader.manifest.revision,
      profile: this.pool ? physical(this.pool.core) : 0,
      base: this.baseSize || 256,
      cpuBytes: this.cpu.bytes + this.reserveBytes,
      gpuBytes: this.gpu.bytes + this.reserveBytes,
      capBytes: this.capBytes,
      blockedBy: this.loader.blockedBy ?? this.blockedBy,
      allocationMode: this.allocationPolicy.mode,
      coverageTarget: this.coverageTarget,
      coverageReady: this.coverageReady,
      workingBytes: this.coverageBudget?.workingBytes ?? 0,
      transitionBytes: this.coverageBudget?.transitionBytes ?? 0,
      cachePages: this.coverageBudget?.cachePages ?? 0,
      requirements: this.requirements,
      slots: this.pool?.slots.length ?? 0,
      used: this.pool ? this.pool.slots.length - this.pool.free : 0,
      aimedLevel: this.aimedLevel(),
      visibleLevel: Math.max(
        0,
        ...this.shown.map((slot) => {
          const level = slot.page?.tile.level ?? 0;
          return level <= this.detailLimit ? level : 0;
        }),
      ),
      requests: this.loader.networkInFlight,
      viewGeneration: this.viewGeneration,
      uploadMs: this.pool?.lastUploadMs ?? 0,
      cpuPeakMs: this.cpuPeakMs,
      shaderCompileMs: this.sphere?.compileMs ?? null,
      warmupMs: this.warmupMs,
      skyGpuMs: this.sphere?.timer.poll() ?? null,
      state: !this.loader.detailStreamingEnabled
        ? "disabled: slow main-thread decode"
        : (this.transition?.phase ??
          (now < this.pauseUntil
            ? "paused"
            : this.group
              ? "streaming"
              : "idle")),
      error:
        this.error ??
        this.pool?.error ??
        this.table?.error ??
        this.loader.error,
    });
    this.cpuPeakMs = 0;
  }
  detach() {
    this.disposed = true;
    this.destroyPool();
    if (this.baseSourceFence)
      (this.renderer.getContext() as WebGL2RenderingContext).deleteSync(
        this.baseSourceFence,
      );
    if (this.baseRetirement)
      (this.renderer.getContext() as WebGL2RenderingContext).deleteSync(
        this.baseRetirement.fence,
      );
    if (this.warmFence)
      (this.renderer.getContext() as WebGL2RenderingContext).deleteSync(
        this.warmFence,
      );
    this.sphere?.dispose();
    for (const texture of [this.base, this.reserve])
      if (texture) {
        texture.dispose();
        this.release(texture);
      }
    this.resources?.release(this.safetyOwner);
    this.resources?.setAllowance(this, 0);
    return { cpu: this.cpu, loader: this.loader, capBytes: this.capBytes };
  }
  dispose() {
    this.detach();
    this.loader.dispose();
  }
}
