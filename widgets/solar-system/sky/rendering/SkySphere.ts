import {
  DataArrayTexture,
  DataTexture,
  FloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Mesh,
  Scene,
  PerspectiveCamera,
  SphereGeometry,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { createGpuFrameTimer } from "@/shared/lib/gpu-frame-timer";
import { createSkyShader } from "./SkyShader";
import type { CachedPixels } from "../streaming/SkyTileCache";
import type { SkyMemory } from "../streaming/SkyMemory";

export function baseTexture(pixels: CachedPixels) {
  const texture = new DataTexture(
    pixels.data,
    pixels.width,
    pixels.height,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = false;
  texture.premultiplyAlpha = false;
  texture.wrapS = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
  return texture;
}

export class SkySphere {
  readonly material;
  readonly mesh;
  readonly dummyPages: DataArrayTexture;
  readonly dummyTable: DataTexture;
  readonly timer;
  private warmTarget: WebGLRenderTarget | null = null;
  private reservation: number;
  private disposed = false;
  compileMs: number | null = null;
  private warmDraw: { run(): void; cancel(): void } | null = null;
  constructor(
    private renderer: WebGLRenderer,
    base: DataTexture,
    private memory: SkyMemory,
  ) {
    const reservation = memory.reserve(
      256 * 1024,
      "sphere-geometry-and-warmup-buffers",
    );
    if (reservation === null) throw new Error("Sky warmup memory unavailable");
    this.reservation = reservation;
    const data = new Float32Array(64 * 56 * 4);
    for (let i = 0; i < data.length; i += 4) data[i] = 1;
    this.dummyPages = new DataArrayTexture(new Uint8Array(4 * 4 * 4), 4, 4, 1);
    this.dummyPages.colorSpace = SRGBColorSpace;
    this.dummyPages.minFilter = this.dummyPages.magFilter = LinearFilter;
    this.dummyPages.needsUpdate = true;
    this.dummyTable = new DataTexture(data, 64, 56, RGBAFormat, FloatType);
    this.dummyTable.needsUpdate = true;
    this.material = createSkyShader(
      base,
      this.dummyPages,
      this.dummyTable,
      1024,
      new Vector2(64, 56),
    );
    this.mesh = new Mesh(new SphereGeometry(500, 64, 48), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = -1000;
    this.timer = createGpuFrameTimer(
      renderer.getContext() as WebGL2RenderingContext,
      "draw",
    );
    this.mesh.onBeforeRender = () => this.timer.begin();
    this.mesh.onAfterRender = () => this.timer.end();
  }

  async warm(): Promise<WebGLSync> {
    if (this.disposed) throw new Error("Sky warmup cancelled");
    const scene = new Scene();
    const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
    const mesh = new Mesh(this.mesh.geometry, this.material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    this.warmTarget = new WebGLRenderTarget(2, 2, { depthBuffer: false });
    const previous = this.renderer.getRenderTarget();
    const started = performance.now();
    let compilation: Promise<unknown>;
    try {
      // Compile the same linear-target variant used by the existing composer. Restore
      // renderer state immediately; other scene work continues while KHR polls asynchronously.
      this.renderer.setRenderTarget(this.warmTarget);
      compilation = this.renderer.compileAsync(scene, camera);
    } finally {
      this.renderer.setRenderTarget(previous);
    }
    await compilation;
    this.compileMs = performance.now() - started;
    if (this.disposed || this.renderer.getContext().isContextLost())
      throw new Error("Sky warmup cancelled");
    return new Promise<WebGLSync>((resolve, reject) => {
      this.warmDraw = {
        cancel: () => reject(new Error("Sky warmup cancelled")),
        run: () => {
          const target = this.renderer.getRenderTarget();
          const uniforms = this.material.uniforms;
          const saved = {
            details: uniforms.detailsEnabled.value,
            fade: uniforms.transition.value,
          };
          try {
            this.renderer.setRenderTarget(this.warmTarget);
            uniforms.detailsEnabled.value = 1;
            uniforms.transition.value = 0.5;
            this.renderer.render(scene, camera);
            const gl = this.renderer.getContext() as WebGL2RenderingContext;
            const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            gl.flush();
            if (!fence) throw new Error("Sky warmup fence unavailable");
            resolve(fence);
          } catch (error) {
            reject(error);
          } finally {
            uniforms.detailsEnabled.value = saved.details;
            uniforms.transition.value = saved.fade;
            this.renderer.setRenderTarget(target);
            this.warmTarget?.dispose();
            this.warmTarget = null;
          }
        },
      };
    });
  }
  pumpWarm(deadline: number) {
    if (this.disposed || !this.warmDraw || performance.now() >= deadline)
      return;
    const job = this.warmDraw;
    this.warmDraw = null;
    job.run();
  }
  dispose() {
    this.disposed = true;
    this.warmDraw?.cancel();
    this.warmDraw = null;
    this.timer.dispose();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.dummyPages.dispose();
    this.dummyTable.dispose();
    this.warmTarget?.dispose();
    this.memory.release(this.reservation);
  }
}
