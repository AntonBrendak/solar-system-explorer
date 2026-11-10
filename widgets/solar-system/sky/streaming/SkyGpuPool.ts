import {
  DataArrayTexture,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type WebGLRenderer,
} from "three";
import { physical, pageBytes } from "../model/sky-config";
import type {
  GpuPage,
  PageCore,
  TileState,
  UploadIdentity,
} from "../model/sky-types";
import type { CachedPixels } from "./SkyTileCache";
import type { SkyMemory } from "./SkyMemory";

export type SkySlot = {
  index: number;
  generation: number;
  state: TileState;
  page: GpuPage | null;
  identity: UploadIdentity | null;
};
type Upload = {
  slot: SkySlot;
  pixels: CachedPixels;
  row: number;
  fence: WebGLSync | null;
  submitted: boolean;
};

/** One outstanding upload, with an immutable source slice until its fence completes. */
export class SkyGpuPool {
  readonly texture: DataArrayTexture;
  readonly slots: SkySlot[];
  readonly reservation: number;
  readonly bytes: number;
  lastUploadMs = 0;
  error: string | null = null;
  private uploadSequence = 0;
  private pending: Upload | null = null;
  private retiring: { fence: WebGLSync; slots: SkySlot[] }[] = [];
  private context: WebGL2RenderingContext;

  constructor(
    private renderer: WebGLRenderer,
    private memory: SkyMemory,
    readonly core: PageCore,
    count: number,
    readonly revision: string,
    readonly contextGeneration: number,
    readonly generation: number,
  ) {
    this.context = renderer.getContext() as WebGL2RenderingContext;
    this.bytes = pageBytes(core) * count;
    const reservation = memory.reserve(this.bytes, "array-backing");
    if (reservation === null) throw new Error("Sky CPU pool budget exceeded");
    this.reservation = reservation;
    this.texture = new DataArrayTexture(
      new Uint8Array(this.bytes),
      physical(core),
      physical(core),
      count,
    );
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.format = RGBAFormat;
    this.texture.type = UnsignedByteType;
    this.texture.minFilter = this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 1;
    this.texture.premultiplyAlpha = false;
    this.texture.flipY = false;
    this.texture.unpackAlignment = 1;
    this.slots = Array.from({ length: count }, (_, index) => ({
      index,
      generation: 0,
      state: "Free",
      page: null,
      identity: null,
    }));
    // Allocate texStorage3D without uploading the entire zero-filled backing array.
    this.texture.source.dataReady = false;
    this.texture.needsUpdate = true;
    this.renderer.initTexture(this.texture);
    if (this.context.getError() !== this.context.NO_ERROR) {
      this.texture.dispose();
      this.memory.release(this.reservation);
      throw new Error("Sky GPU array allocation failed");
    }
    this.texture.source.dataReady = true;
    this.texture.onUpdate = () => {
      const pending = this.pending;
      if (!pending || pending.submitted) return;
      // Three r186 invokes onUpdate AFTER texSubImage3D, inside initTexture.
      pending.submitted = true;
      pending.fence = this.context.fenceSync(
        this.context.SYNC_GPU_COMMANDS_COMPLETE,
        0,
      );
      if (!pending.fence) this.error = "Sky upload fence creation failed";
      this.context.flush();
    };
  }
  get busy() {
    return this.pending !== null;
  }
  get pendingTileKey() {
    const tile = this.pending?.slot.page?.tile;
    return tile ? `${tile.level}/${tile.row}/${tile.column}` : null;
  }
  get free() {
    return this.slots.filter((slot) => slot.state === "Free").length;
  }
  find(page: GpuPage) {
    return this.slots.find(
      (slot) => slot.page?.id === page.id && slot.state !== "Retiring",
    );
  }

  queue(page: GpuPage, pixels: CachedPixels) {
    if (this.pending || !this.memory.owns(pixels.reservation)) return false;
    const slot = this.slots.find((candidate) => candidate.state === "Free");
    if (!slot) return false;
    slot.generation++;
    slot.page = page;
    slot.state = "Upload queued";
    slot.identity = {
      atlasRevision: this.revision,
      contextGeneration: this.contextGeneration,
      poolGeneration: this.generation,
      slotGeneration: slot.generation,
      upload: ++this.uploadSequence,
      reservation: pixels.reservation,
    };
    this.pending = { slot, pixels, row: 0, fence: null, submitted: false };
    return true;
  }

  cancelQueued() {
    if (!this.pending || this.pending.submitted) return;
    const slot = this.pending.slot;
    slot.state = "Free";
    slot.page = null;
    slot.identity = null;
    this.pending = null;
  }

  /** Chunk copying also pauses under scene overload. One heavy GL submission per tick. */
  work(deadline: number, maySubmit: boolean) {
    const pending = this.pending;
    if (!pending || pending.submitted) return false;
    const size = physical(this.core);
    const stride = size * 4;
    const destination = this.texture.image.data as Uint8Array;
    const source = pending.pixels;
    while (pending.row < size && performance.now() < deadline) {
      // Network gutters are inherited at external borders and taken from neighbouring core pixels internally.
      const sourceRow = pending.slot.page!.y * this.core + pending.row;
      const sourceOffset =
        (sourceRow * source.width + pending.slot.page!.x * this.core) * 4;
      const destinationOffset =
        pending.slot.index * size * stride + pending.row * stride;
      destination.set(
        source.data.subarray(sourceOffset, sourceOffset + stride),
        destinationOffset,
      );
      pending.row++;
    }
    if (pending.row !== size || !maySubmit || performance.now() >= deadline)
      return false;
    const submission = performance.now();
    this.texture.addLayerUpdate(pending.slot.index);
    this.texture.needsUpdate = true;
    this.renderer.initTexture(this.texture);
    this.lastUploadMs = performance.now() - submission;
    return true;
  }

  poll(useful: (page: GpuPage) => boolean) {
    const gl = this.context;
    if (gl.isContextLost()) return;
    const pending = this.pending;
    if (pending?.fence) {
      const status = gl.clientWaitSync(pending.fence, 0, 0);
      if (status !== gl.TIMEOUT_EXPIRED) {
        gl.deleteSync(pending.fence);
        if (status === gl.WAIT_FAILED) {
          pending.fence = null;
          pending.slot.state = "Failed";
          this.error = "Sky GPU upload wait failed";
          return; // Keep its immutable source/reservation quarantined until context teardown.
        }
        const { slot } = pending;
        const identity = slot.identity;
        const valid =
          identity &&
          identity.atlasRevision === this.revision &&
          identity.contextGeneration === this.contextGeneration &&
          identity.poolGeneration === this.generation &&
          identity.slotGeneration === slot.generation &&
          identity.upload === this.uploadSequence &&
          identity.reservation === pending.pixels.reservation &&
          this.memory.owns(identity.reservation) &&
          slot.page &&
          useful(slot.page);
        slot.state = valid ? "GPU uploaded" : "Free";
        if (!valid) {
          slot.page = null;
          slot.identity = null;
        }
        this.pending = null;
      }
    }
    for (const batch of [...this.retiring]) {
      const status = gl.clientWaitSync(batch.fence, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) continue;
      gl.deleteSync(batch.fence);
      if (status === gl.WAIT_FAILED) {
        this.error = "Sky retirement wait failed";
        this.retiring.splice(this.retiring.indexOf(batch), 1);
        continue; // Quarantine these slots; never reuse after an unconfirmed read.
      }
      for (const slot of batch.slots) {
        slot.state = "Free";
        slot.page = null;
        slot.identity = null;
      }
      this.retiring.splice(this.retiring.indexOf(batch), 1);
    }
  }

  retire(slots: SkySlot[]) {
    const candidates = slots.filter(
      (slot) =>
        slot !== this.pending?.slot &&
        slot.state !== "Retiring" &&
        slot.state !== "Free",
    );
    if (!candidates.length) return;
    const fence = this.context.fenceSync(
      this.context.SYNC_GPU_COMMANDS_COMPLETE,
      0,
    );
    for (const slot of candidates) slot.state = "Retiring";
    if (fence) {
      this.retiring.push({ fence, slots: candidates });
      this.context.flush();
    } else this.error = "Sky retirement fence creation failed";
  }
  dispose() {
    if (this.pending?.fence) this.context.deleteSync(this.pending.fence);
    for (const batch of this.retiring) this.context.deleteSync(batch.fence);
    this.pending = null;
    this.retiring = [];
    this.texture.dispose();
    // Drop CPU backing explicitly, including on context loss.
    this.texture.image.data = new Uint8Array(0);
    this.memory.release(this.reservation);
  }
}
