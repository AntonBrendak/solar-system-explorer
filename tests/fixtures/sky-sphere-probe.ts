import {
  BackSide,
  DataArrayTexture,
  DataTexture,
  FloatType,
  FrontSide,
  GLSL3,
  LinearFilter,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { createSkyShader } from "../../widgets/solar-system/sky/rendering/SkyShader";

export function renderSphereProjectionProbe(pitch: number, yaw: number) {
  const size = 512;
  const renderer = new WebGLRenderer({ antialias: false });
  const failures: string[] = [];
  renderer.debug.onShaderError = (gl, program) =>
    failures.push(gl.getProgramInfoLog(program) ?? "Shader compilation failed");
  if (!renderer.extensions.has("EXT_color_buffer_float"))
    throw new Error("Float target unavailable");
  const pixels = new Uint8Array(2048 * 1024 * 4);
  for (let y = 0; y < 1024; y++)
    for (let x = 0; x < 2048; x++) {
      const value =
        0.12 +
        0.5 *
          Math.exp(
            -((((x + 3) % 17) - 8) ** 2 + (((y + 5) % 19) - 9) ** 2) / 2,
          );
      const i = (y * 2048 + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value * 255;
      pixels[i + 3] = 255;
    }
  const source = new DataTexture(pixels, 2048, 1024);
  source.minFilter = source.magFilter = LinearFilter;
  source.needsUpdate = true;
  const pages = new DataArrayTexture(new Uint8Array(4), 1, 1, 1);
  pages.needsUpdate = true;
  const table = new DataTexture(
    new Float32Array(64 * 60 * 4),
    64,
    60,
    RGBAFormat,
    FloatType,
  );
  table.needsUpdate = true;
  const scene = new Scene();
  const camera = new PerspectiveCamera(48, 1, 0.1, 1000);
  camera.lookAt(
    new Vector3(
      Math.cos(pitch) * Math.sin(yaw),
      Math.sin(pitch),
      -Math.cos(pitch) * Math.cos(yaw),
    ),
  );
  camera.updateMatrixWorld();
  const geometry = new SphereGeometry(500, 64, 48);
  const mesh: Mesh = new Mesh(geometry);
  scene.add(mesh);
  const target = new WebGLRenderTarget(size, size, {
    type: FloatType,
    depthBuffer: false,
  });
  renderer.setRenderTarget(target);
  const materials = (["uv", "direction"] as const).map((projection) =>
    createSkyShader(
      source,
      pages,
      table,
      1024,
      new Vector2(64, 60),
      projection,
    ),
  );
  const render = (material: ShaderMaterial) => {
    mesh.material = material;
    renderer.render(scene, camera);
    const result = new Float32Array(size * size * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, result);
    return result;
  };
  const old = render(materials[0]),
    direction = render(materials[1]);
  const reference = new ShaderMaterial({
    glslVersion: GLSL3,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      source: { value: source },
      inverse: {
        value: new Matrix4().multiplyMatrices(
          camera.matrixWorld,
          camera.projectionMatrixInverse,
        ),
      },
    },
    vertexShader: "void main(){gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D source; uniform mat4 inverse; out vec4 colour;
      void main(){vec2 ndc=gl_FragCoord.xy/512.*2.-1.; vec4 point=inverse*vec4(ndc,-1.,1.);
      vec3 ray=normalize(point.xyz/point.w); vec2 uv=vec2(fract(atan(ray.z,-ray.x)/6.283185307179586),atan(length(ray.xz),ray.y)/3.141592653589793);
      colour=texture(source,uv);}`,
  });
  const plane = new PlaneGeometry(2, 2);
  mesh.geometry = plane;
  const expected = render(reference);
  const difference = (actual: Float32Array) => {
    let sum = 0,
      max = 0;
    for (let i = 0; i < actual.length; i += 4) {
      const error = Math.abs(actual[i] - expected[i]);
      sum += error * error;
      max = Math.max(max, error);
    }
    return { rmse: Math.sqrt(sum / (size * size)), maximum: max };
  };
  const result = {
    old: difference(old),
    direction: difference(direction),
    failures,
  };
  geometry.dispose();
  plane.dispose();
  materials.forEach((material) => material.dispose());
  reference.dispose();
  source.dispose();
  pages.dispose();
  table.dispose();
  target.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return result;
}

export function renderCoverageFloorProbe(fov?: number, fadeFloor = false) {
  const renderer = new WebGLRenderer({ antialias: false });
  const base = new DataTexture(new Uint8Array([0, 0, 255, 255]), 1, 1);
  base.needsUpdate = true;
  const core = 256,
    physical = core + 4;
  const layers = fov === undefined ? 1 : 3;
  const data = new Uint8Array(physical * physical * 4 * layers);
  for (let i = 0; i < data.length; i += 4) {
    const layer = Math.floor(i / (physical * physical * 4));
    data[i + (fov === undefined ? 0 : 2 - layer)] = 255;
    data[i + 3] = 255;
  }
  const pages = new DataArrayTexture(data, physical, physical, layers);
  pages.minFilter = pages.magFilter = LinearFilter;
  pages.needsUpdate = true;
  const entries = new Float32Array(256 * 240 * 4);
  for (const level of fov === undefined ? [16] : [16, 32, 64]) {
    const columns = (level * 1024) / core;
    const offset = (level / 8 - 1) * 16;
    for (let y = 0; y < columns / 2; y++)
      for (let x = 0; x < columns; x++)
        entries[((y + offset) * 256 + x) * 4] = Math.log2(level / 16) + 1;
  }
  const table = new DataTexture(entries, 256, 240, RGBAFormat, FloatType);
  table.needsUpdate = true;
  const material = createSkyShader(
    base,
    pages,
    table,
    core,
    new Vector2(256, 240),
    fov === undefined ? "uv" : "direction",
  );
  material.side = fov === undefined ? FrontSide : BackSide;
  material.uniforms.detailsEnabled.value = 1;
  material.uniforms.coverageFloor.value = 16;
  if (fadeFloor) {
    material.uniforms.coverageFloor.value = 8;
    material.uniforms.previousCoverageFloor.value = 16;
    material.uniforms.previousDetailLimit.value = 16;
    material.uniforms.coverageBlend.value = 0.5;
  }
  material.uniforms.detailLimit.value = fov === undefined ? 16 : 64;
  material.uniforms.zoneScale.value = 1e6;
  material.uniforms.viewportSize.value.set(512, 512);
  const geometry =
    fov === undefined
      ? new PlaneGeometry(2, 2)
      : new SphereGeometry(500, 64, 48);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, 0.4 + uv.getX(i) / 16, 0.4 + uv.getY(i) / 8);
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera =
    fov === undefined
      ? new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      : new PerspectiveCamera(fov, 1, 0.1, 1000);
  if (fov === undefined) camera.position.z = 1;
  const target = new WebGLRenderTarget(512, 512, { depthBuffer: false });
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixel = new Uint8Array(4);
  renderer.readRenderTargetPixels(target, 256, 256, 1, 1, pixel);
  base.dispose();
  pages.dispose();
  table.dispose();
  material.dispose();
  geometry.dispose();
  target.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return [...pixel];
}
