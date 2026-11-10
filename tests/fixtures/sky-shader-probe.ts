import {
  DataArrayTexture,
  DataTexture,
  DoubleSide,
  FloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { createSkyShader } from "../../widgets/solar-system/sky/rendering/SkyShader";
import { coverageEdgeMask } from "../../widgets/solar-system/sky/rendering/sky-coverage";
export {
  renderSphereProjectionProbe,
  renderCoverageFloorProbe,
} from "./sky-sphere-probe";

export function renderSkyProbe(parent: boolean, gradient = false) {
  const renderer = new WebGLRenderer({ antialias: false });
  const failures: string[] = [];
  renderer.debug.onShaderError = (gl, program) => {
    failures.push(gl.getProgramInfoLog(program) ?? "shader error");
  };
  const base = new DataTexture(new Uint8Array([0, 0, 255, 255]), 1, 1);
  base.needsUpdate = true;
  const core = 1024,
    physical = core + 4,
    layers = parent || gradient ? 2 : 1;
  const reference = (pixel: number) =>
    Math.round(
      30 +
        200 * Math.exp(-Math.pow((pixel - 1023.5) / 3, 2)) +
        20 * Math.sin(pixel / 7),
    );
  const pixels = new Uint8Array(physical * physical * layers * 4);
  for (let layer = 0; layer < layers; layer++) {
    for (
      let i = layer * physical * physical * 4;
      i < (layer + 1) * physical * physical * 4;
      i += 4
    ) {
      if (gradient)
        pixels[i] = reference(layer * core + ((i / 4) % physical) - 2);
      else pixels[i + (parent && !layer ? 1 : 0)] = 255;
      pixels[i + 3] = 255;
    }
  }
  const pages = new DataArrayTexture(pixels, physical, physical, layers);
  pages.minFilter = pages.magFilter = LinearFilter;
  pages.needsUpdate = true;
  const data = new Float32Array(64 * 60 * 4);
  const entries = parent
    ? [
        { x: 17, y: 7, columns: 32, offset: 12, layer: 0 },
        { x: 35, y: 15, columns: 64, offset: 28, layer: 1 },
      ]
    : [
        { x: 7, y: 3, columns: 16, offset: 4, layer: 0 },
        { x: 8, y: 3, columns: 16, offset: 4, layer: gradient ? 1 : 0 },
      ];
  for (const entry of entries)
    data[((entry.y + entry.offset) * 64 + entry.x) * 4] = entry.layer + 1;
  for (const entry of entries)
    data[((entry.y + entry.offset) * 64 + entry.x) * 4 + 1] = coverageEdgeMask(
      data,
      64,
      entry.offset,
      entry.columns,
      entry.x,
      entry.y,
    );
  const table = new DataTexture(data, 64, 60, RGBAFormat, FloatType);
  table.minFilter = table.magFilter = NearestFilter;
  table.needsUpdate = true;
  const material = createSkyShader(
    base,
    pages,
    table,
    core,
    new Vector2(64, 60),
    "uv",
  );
  material.side = DoubleSide;
  material.uniforms.detailsEnabled.value = 1;
  material.uniforms.coverageFloor.value = 64;
  material.uniforms.zoneScale.value = 1e6;
  const geometry = new PlaneGeometry(2, 2);
  const uv = geometry.getAttribute("uv");
  const left = parent ? 35 / 64 : 7 / 16;
  const right = parent ? 36 / 64 : 9 / 16;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i),
      v = uv.getY(i);
    uv.setXY(
      i,
      left + u * (right - left),
      1 - (parent ? 15 / 32 + v / 32 : 3 / 8 + v / 8),
    );
  }
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;
  const width = gradient ? 2049 : 512;
  const target = new WebGLRenderTarget(width, 128);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const row = new Uint8Array(width * 4);
  renderer.readRenderTargetPixels(target, 0, 64, width, 1, row);
  let joinMaxError = 0;
  if (gradient)
    for (let x = 960; x <= 1088; x++) {
      const position = ((x + 0.5) / width) * 2048 - 0.5;
      const start = Math.floor(position),
        fraction = position - start;
      const expected =
        reference(start) * (1 - fraction) + reference(start + 1) * fraction;
      joinMaxError = Math.max(joinMaxError, Math.abs(row[x * 4] - expected));
    }
  renderer.dispose();
  target.dispose();
  geometry.dispose();
  material.dispose();
  base.dispose();
  pages.dispose();
  table.dispose();
  renderer.forceContextLoss();
  return { row: Array.from(row), failures, joinMaxError };
}
