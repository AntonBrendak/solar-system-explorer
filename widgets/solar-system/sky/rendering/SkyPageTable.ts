import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  type WebGLRenderer,
} from "three";
import type { SkySlot } from "../streaming/SkyGpuPool";
import type { PageCore } from "../model/sky-types";
import type { SkyMemory } from "../streaming/SkyMemory";
import { coverageEdgeMask } from "./sky-coverage";

export class SkyPageTable {
  readonly textures: [DataTexture, DataTexture];
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  active = 0;
  error: string | null = null;
  private reservation: number;
  private fence: WebGLSync | null = null;
  private submitted = false;
  private prepared = false;
  private clearOffset = 0;
  private stagedSlots: SkySlot[] = [];
  private entryOffset = 0;
  private edgeOffset = 0;
  lastUploadMs = 0;
  constructor(
    readonly core: PageCore,
    private memory: SkyMemory,
  ) {
    this.width = 65536 / core;
    this.height = (this.width * 15) / 16;
    this.bytes = this.width * this.height * 16 * 2;
    const reservation = memory.reserve(this.bytes, "page-tables");
    if (reservation === null)
      throw new Error("Sky page table CPU budget exceeded");
    this.reservation = reservation;
    this.textures = [this.create(), this.create()];
  }
  private create() {
    const texture = new DataTexture(
      new Float32Array(this.width * this.height * 4),
      this.width,
      this.height,
      RGBAFormat,
      FloatType,
    );
    texture.minFilter = texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  }
  get current() {
    return this.textures[this.active];
  }
  get next() {
    return this.textures[1 - this.active];
  }
  stage(renderer: WebGLRenderer, slots: SkySlot[]) {
    if (this.submitted) return false;
    this.stagedSlots = slots.slice();
    this.clearOffset = 0;
    this.entryOffset = 0;
    this.edgeOffset = 0;
    this.prepared = false;
    this.submitted = true;
    void renderer;
    return true;
  }
  /** Preparation/copying shares the 1 ms streaming budget; no block exceeds 256 KiB. */
  work(renderer: WebGLRenderer, deadline: number) {
    if (!this.submitted || this.prepared) return;
    const data = this.next.image.data as Float32Array;
    while (this.clearOffset < data.length && performance.now() < deadline) {
      const end = Math.min(data.length, this.clearOffset + 65536);
      data.fill(0, this.clearOffset, end);
      this.clearOffset = end;
    }
    if (this.clearOffset < data.length || performance.now() >= deadline) return;
    while (
      this.entryOffset < this.stagedSlots.length &&
      performance.now() < deadline
    ) {
      const slot = this.stagedSlots[this.entryOffset++];
      const page = slot.page;
      if (!page) continue;
      const rowsBefore = ((page.tile.level / 8 - 1) * this.width) / 16;
      const subdivisions = 2048 / this.core;
      const x = page.tile.column * subdivisions + page.x;
      const y = rowsBefore + page.tile.row * subdivisions + page.y;
      data[(y * this.width + x) * 4] = slot.index + 1;
    }
    if (
      this.entryOffset < this.stagedSlots.length ||
      performance.now() >= deadline
    )
      return;
    while (
      this.edgeOffset < this.stagedSlots.length &&
      performance.now() < deadline
    ) {
      const page = this.stagedSlots[this.edgeOffset++].page;
      if (!page) continue;
      const offset = ((page.tile.level / 8 - 1) * this.width) / 16;
      const divisions = 2048 / this.core;
      const x = page.tile.column * divisions + page.x;
      const y = page.tile.row * divisions + page.y;
      data[((offset + y) * this.width + x) * 4 + 1] = coverageEdgeMask(
        data,
        this.width,
        offset,
        (page.tile.level * 1024) / this.core,
        x,
        y,
      );
    }
    if (
      this.edgeOffset < this.stagedSlots.length ||
      performance.now() >= deadline
    )
      return;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    this.next.onUpdate = () => {
      this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!this.fence) this.error = "Sky page table fence creation failed";
      gl.flush();
    };
    this.prepared = true;
    this.next.needsUpdate = true;
    const started = performance.now();
    renderer.initTexture(this.next);
    this.lastUploadMs = performance.now() - started;
    return true;
  }
  poll(renderer: WebGLRenderer) {
    if (!this.fence) return false;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const result = gl.clientWaitSync(this.fence, 0, 0);
    if (result === gl.TIMEOUT_EXPIRED) return false;
    gl.deleteSync(this.fence);
    this.fence = null;
    if (result === gl.WAIT_FAILED) {
      this.error = "Sky page table upload failed";
      return false;
    }
    return true;
  }
  commit() {
    this.active = 1 - this.active;
    this.discard();
  }
  discard() {
    this.submitted = false;
    this.prepared = false;
    this.stagedSlots = [];
  }
  dispose(renderer: WebGLRenderer) {
    if (this.fence)
      (renderer.getContext() as WebGL2RenderingContext).deleteSync(this.fence);
    for (const texture of this.textures) {
      texture.dispose();
      texture.image.data = new Float32Array(0);
    }
    this.memory.release(this.reservation);
  }
}
