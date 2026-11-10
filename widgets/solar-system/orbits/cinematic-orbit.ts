import {
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Vector3,
} from "three";
import { Line2, LineGeometry, LineMaterial } from "three-stdlib";
import { getPlanetOrbitPoints, type OrbitPoint } from "@/entities/planet/orbit";
import { planetIds, type PlanetId } from "@/entities/planet/types";
import { CINEMATIC_ORBIT_STYLE as STYLE } from "./orbit-appearance";

const VERTEX_HEADER = /* glsl */ `
  attribute vec3 instanceStartLow;
  attribute vec3 instanceEndLow;
  attribute vec3 instancePrevious;
  attribute vec3 instancePreviousLow;
  attribute vec3 instanceNext;
  attribute vec3 instanceNextLow;
  attribute float instanceOrbitStart;
  attribute float instanceOrbitEnd;
  uniform vec3 orbitCameraHigh;
  uniform vec3 orbitCameraLow;
  varying float vOrbitProgress;

  // The map uses heliocentric coordinates. Subtract high/low camera parts before
  // rotation, retaining precision even beside an outer-planet trajectory.
  vec3 orbitView(vec3 high, vec3 low) {
    return mat3(viewMatrix) * ((high - orbitCameraHigh) + (low - orbitCameraLow));
  }
  vec2 orbitScreen(vec3 p, float aspect) {
    vec4 clip = projectionMatrix * vec4(p, 1.0);
    return clip.xy / max(clip.w, 0.000001) * vec2(aspect, 1.0);
  }
  vec2 orbitJoin(vec3 previous, vec3 center, vec3 next, float aspect) {
    vec2 a = orbitScreen(center, aspect) - orbitScreen(previous, aspect);
    vec2 b = orbitScreen(next, aspect) - orbitScreen(center, aspect);
    a /= max(length(a), 0.000001);
    b /= max(length(b), 0.000001);
    vec2 n0 = vec2(a.y, -a.x), n1 = vec2(b.y, -b.x);
    vec2 miter = n0 + n1;
    if (length(miter) < 0.0001) return n1;
    miter = normalize(miter);
    return miter / max(dot(miter, n1), 0.35);
  }
`;

const FRAGMENT_HEADER = /* glsl */ `
  varying float vOrbitProgress;
  uniform float orbitPhase;
  uniform float orbitHighlight;
  uniform float orbitMotion;
  uniform float orbitCoreWidth;
  uniform vec3 orbitAccent;
`;

const COVERAGE = /* glsl */ `
  float trail = 0.0, crest = 0.0;
  if (orbitMotion > 0.001) {
    float distanceToLight = abs(vOrbitProgress - orbitPhase);
    distanceToLight = min(distanceToLight, 1.0 - distanceToLight);
    float broad = distanceToLight / 0.09;
    float narrow = distanceToLight / 0.018;
    trail = exp2(-0.72134752 * broad * broad);
    crest = exp2(-0.72134752 * narrow * narrow);
  }
  float light = (0.28 * trail + 0.24 * crest) * orbitMotion;
  vec3 tint = mix(vec3(0.28, 0.40, 0.51), orbitAccent, 0.25 + orbitHighlight * 0.5);
  tint = mix(tint, vec3(0.84, 0.94, 1.0), light);
  float distancePixels = abs(vUv.x) * linewidth * 0.5;
  float aa = max(fwidth(distancePixels), 0.35);
  float core = 1.0 - smoothstep(orbitCoreWidth * 0.5 - aa * 0.5,
                              orbitCoreWidth * 0.5 + aa * 0.5, distancePixels);
  float halo = exp2(-0.545 * distancePixels * distancePixels) * orbitHighlight * 0.18;
  float coverage = core + (1.0 - core) * halo;
  float luminance = 0.62 + 0.38 * trail * orbitMotion;
  vec4 diffuseColor = vec4(tint, alpha * coverage * luminance);
`;

function patch(shader: string, before: string, after: string) {
  if (!shader.includes(before))
    throw new Error(
      "Cinematic orbit shader is incompatible with LineMaterial.",
    );
  return shader.replace(before, after);
}

function vectorAttribute(points: readonly OrbitPoint[], low: boolean) {
  return new InstancedBufferAttribute(
    new Float32Array(
      points.flatMap((point) =>
        point.map((value) =>
          low ? value - Math.fround(value) : Math.fround(value),
        ),
      ),
    ),
    3,
  );
}

export function createCinematicOrbit(
  id: PlanetId,
  date: Date,
  segments: number,
  color: string,
) {
  // Close only the visual guide at a shared vertex; live astronomical positions are unchanged.
  const sampled = getPlanetOrbitPoints(id, date, segments).slice(0, -1);
  const count = sampled.length;
  const points = [...sampled, sampled[0]];
  const distances = [0];
  let radius = 0;
  for (let i = 0; i < count; i++) {
    radius += Math.hypot(...sampled[i]);
    distances.push(
      distances[i] +
        Math.hypot(
          ...points[i + 1].map((value, axis) => value - points[i][axis]),
        ),
    );
  }
  radius /= count;
  const progress = distances.map(
    (distance) => distance / (distances[count] || 1),
  );
  const geometry = new LineGeometry();
  geometry.setPositions(points.flat());
  // Four vertices per segment, with shared miter joins: no overlapping endcaps.
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3),
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute([-1, -1, 1, -1, -1, 1, 1, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute(
    "instanceStartLow",
    vectorAttribute(points.slice(0, -1), true),
  );
  geometry.setAttribute(
    "instanceEndLow",
    vectorAttribute(points.slice(1), true),
  );
  const previous = sampled.map((_, i) => sampled[(i - 1 + count) % count]);
  const next = sampled.map((_, i) => sampled[(i + 2) % count]);
  geometry.setAttribute("instancePrevious", vectorAttribute(previous, false));
  geometry.setAttribute("instancePreviousLow", vectorAttribute(previous, true));
  geometry.setAttribute("instanceNext", vectorAttribute(next, false));
  geometry.setAttribute("instanceNextLow", vectorAttribute(next, true));
  geometry.setAttribute(
    "instanceOrbitStart",
    new InstancedBufferAttribute(new Float32Array(progress.slice(0, -1)), 1),
  );
  geometry.setAttribute(
    "instanceOrbitEnd",
    new InstancedBufferAttribute(new Float32Array(progress.slice(1)), 1),
  );

  const material = new LineMaterial({
    color: 0xffffff,
    linewidth: STYLE.ribbonWidth,
    worldUnits: false,
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    alphaToCoverage: false,
  });
  const uniforms = {
    orbitPhase: { value: planetIds.indexOf(id) / planetIds.length },
    orbitHighlight: { value: 0 },
    orbitMotion: { value: 0 },
    orbitCoreWidth: { value: STYLE.coreWidth as number },
    orbitAccent: { value: new Color(color) },
    orbitCameraHigh: { value: new Vector3() },
    orbitCameraLow: { value: new Vector3() },
  };
  Object.assign(material.uniforms, uniforms);
  material.vertexShader =
    VERTEX_HEADER +
    patch(
      material.vertexShader,
      "void main() {",
      `void main() {
    vOrbitProgress = position.y < 0.5 ? instanceOrbitStart : instanceOrbitEnd;`,
    );
  material.vertexShader = patch(
    material.vertexShader,
    "vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );",
    "vec4 start = vec4(orbitView(instanceStart, instanceStartLow), 1.0); bool orbitStartFront = start.z < -0.000001;",
  );
  material.vertexShader = patch(
    material.vertexShader,
    "vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );",
    "vec4 end = vec4(orbitView(instanceEnd, instanceEndLow), 1.0); bool orbitEndFront = end.z < -0.000001;",
  );
  material.vertexShader = patch(
    material.vertexShader,
    "dir = normalize( dir );",
    "dir /= max(length(dir), 0.000001);",
  );
  material.vertexShader = patch(
    material.vertexShader,
    "vec2 offset = vec2( dir.y, - dir.x );",
    `
    vec2 offset = vec2(dir.y, -dir.x);
    vec3 previous = orbitView(instancePrevious, instancePreviousLow);
    vec3 next = orbitView(instanceNext, instanceNextLow);
    if (orbitStartFront && orbitEndFront) {
      if (position.y < 0.5 && previous.z < -0.000001) offset = orbitJoin(previous, start.xyz, end.xyz, aspect);
      else if (position.y >= 0.5 && next.z < -0.000001) offset = orbitJoin(start.xyz, end.xyz, next, aspect);
    }
  `,
  );
  material.fragmentShader =
    FRAGMENT_HEADER +
    patch(
      material.fragmentShader,
      "vec4 diffuseColor = vec4( diffuse, alpha );",
      COVERAGE,
    );
  material.name = "Cinematic orbit: single-pass core and halo";
  const line = new Line2(geometry, material);
  line.name = `orbit-${id}`;
  line.visible = false;
  line.renderOrder = STYLE.renderOrder;
  line.frustumCulled = false;
  line.raycast = () => {};
  // Explicit CSS-pixel resolution works with both the DPR-scaled composer and raycasting.
  line.onBeforeRender = () => {};

  const hitGeometry = new LineGeometry();
  const pairs = new Float64Array(count * 6);
  for (let i = 0; i < count; i++) {
    pairs.set(points[i], i * 6);
    pairs.set(points[i + 1], i * 6 + 3);
  }
  const buffer = new InstancedInterleavedBuffer(pairs, 6, 1);
  hitGeometry.setAttribute(
    "instanceStart",
    new InterleavedBufferAttribute(buffer, 3, 0),
  );
  hitGeometry.setAttribute(
    "instanceEnd",
    new InterleavedBufferAttribute(buffer, 3, 3),
  );
  hitGeometry.computeBoundingBox();
  hitGeometry.computeBoundingSphere();
  const hitMaterial = new LineMaterial({
    linewidth: STYLE.hitWidth,
    worldUnits: false,
  });
  const hit = new Line2(hitGeometry, hitMaterial);
  // Three/R3F raycast invisible objects. This proxy never uploads buffers or issues a draw call.
  hit.visible = false;
  const normal = new Vector3(...sampled[0])
    .cross(new Vector3(...sampled[Math.floor(count / 4)]))
    .normalize();
  return {
    geometry,
    material,
    line,
    hitGeometry,
    hitMaterial,
    hit,
    raycast: hit.raycast,
    uniforms,
    radius,
    normal,
  };
}
