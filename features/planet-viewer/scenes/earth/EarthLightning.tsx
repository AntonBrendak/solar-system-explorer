"use client";

import { useSceneTexture } from "../../model/useSceneTexture";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { earthTextures } from "./textures";
import {
  AdditiveBlending,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import type { CloudFrameState } from "./cloud-frame-state";
import { CLOUD_TOP_RADIUS, MAX_CLOUD_FLASHES } from "./cloud-volume-shaders";
import { cloudCoverShader } from "./cloud-cover-shader";

/**
 * Satellite-style optical lightning. This deliberately does NOT draw visible
 * ground-to-cloud bolts: GOES GLM / MTG LI see intermittent cloud-top light.
 *
 * NOAA: locations of observed optical flashes, replayed (not original timing).
 * EUMETSAT: sampled from the LI accumulated-flash-area WMS layer;
 *           event timing is synthesized from relative activity.
 *
 * Mount inside the same rotated Earth group as EarthClouds and pass cloudFrames. Earth R = 2.
 * Existing cloud shell R ~= 2.025, precipitation shell R ~= 2.045.
 */

const NOAA_URL = "/api/lightning/noaa";
const EUMETSAT_URL = "/api/lightning/eumetsat";

const NOAA_POLL_MS = 60_000;
const EUMETSAT_POLL_MS = 5 * 60_000;
const MAX_INSTANCES = 48;
const CLOUD_GLOW_RADIUS = CLOUD_TOP_RADIUS + 0.0005;
const MAX_EUMETSAT_POINTS = 1100;

interface GeoPoint {
  lat: number;
  lon: number;
}
interface NoaaPoint extends GeoPoint {
  observedWindowStart?: string;
}
interface NoaaPayload {
  stale?: boolean;
  flashes?: NoaaPoint[];
}
interface ActivityPoint extends GeoPoint {
  strength: number;
  cumulative: number;
}
interface ActivityData {
  points: ActivityPoint[];
  totalStrength: number;
}

const NO_ACTIVITY: ActivityData = { points: [], totalStrength: 0 };
const UP = new Vector3(0, 0, 1);

function validGeo(p: GeoPoint): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  );
}

// Same geographic convention used in our geo-to-sphere helper:
// 0 deg => +X, east => -Z; the mesh must be inside the Earth rotation group.
function geoNormal(p: GeoPoint): Vector3 {
  const lat = (p.lat * Math.PI) / 180;
  const lon = (p.lon * Math.PI) / 180;
  return new Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.sin(lon),
  ).normalize();
}

/**
 * Interpret WMS PNG alpha only as *relative* accumulated optical coverage.
 * Colored WMS pixels are a visualization, not calibrated flash counts.
 * A nearly fully opaque WMS map is rejected to avoid false worldwide flashes.
 */
function parseEumetsatImage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): ActivityData {
  const tile = 8;
  const stride = 2;
  const points: ActivityPoint[] = [];
  let usedTiles = 0;

  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumAlpha = 0;
      for (let dy = 1; dy < tile && y + dy < height; dy += stride) {
        for (let dx = 1; dx < tile && x + dx < width; dx += stride) {
          const sx = x + dx;
          const sy = y + dy;
          const i = (sy * width + sx) * 4;
          const alpha = rgba[i + 3] / 255;
          if (alpha < 0.35) continue;
          count++;
          sumX += sx;
          sumY += sy;
          sumAlpha += alpha;
        }
      }
      if (count === 0) continue;
      usedTiles++;
      const coverage = count / 16;
      const avgAlpha = sumAlpha / count;
      const strength = Math.min(1, coverage * 1.5) * avgAlpha;
      const lon = (sumX / count / width) * 360 - 180;
      const lat = 90 - (sumY / count / height) * 180;

      // Most overlapping EUMETSAT / NOAA observations: use NOAA in the west.
      if (lon < -55) continue;
      points.push({ lat, lon, strength, cumulative: 0 });
    }
  }

  const allTiles = Math.ceil(width / tile) * Math.ceil(height / tile);
  if (usedTiles > allTiles * 0.6) {
    throw new Error(
      "EUMETSAT WMS is mostly opaque; check the layer/transparency",
    );
  }

  points.sort((a, b) => b.strength - a.strength);
  const selected = points.slice(0, MAX_EUMETSAT_POINTS);
  let weight = 0;
  let totalStrength = 0;
  for (const point of selected) {
    weight += Math.pow(point.strength, 1.7);
    totalStrength += point.strength;
    point.cumulative = weight;
  }
  return { points: selected, totalStrength };
}

function sampleEumetsat(data: ActivityData): ActivityPoint | undefined {
  const points = data.points;
  if (!points.length) return undefined;
  const max = points[points.length - 1].cumulative;
  if (max <= 0) return undefined;
  const target = Math.random() * max;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].cumulative < target) lo = mid + 1;
    else hi = mid;
  }
  return points[lo];
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aBorn;
  attribute float aDuration;
  attribute float aDiameter;
  attribute float aStrength;
  attribute float aSeed;

  uniform float uTime;
  uniform float uShellRadius;

  varying vec2 vPatchUv;
  varying vec2 vCloudUv;
  varying float vAge;
  varying float vStrength;
  varying float vSeed;
  varying vec3 vNormalWorld;

  const float PI = 3.141592653589793;

  void main() {
    vPatchUv = uv;
    vAge = (uTime - aBorn) / max(aDuration, 0.001);
    vStrength = aStrength;
    vSeed = aSeed;

    // Expired slots are placed outside clip space (no fragments to shade).
    if (vAge < 0.0 || vAge > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    // Conform the rectangular patch to a thin spherical shell. The matrix
    // positions and rotates it at an observed lat/lon, but does not scale it.
    vec2 xy = position.xy * aDiameter;
    float inward = sqrt(max(0.0, uShellRadius * uShellRadius - dot(xy, xy)))
      - uShellRadius;
    vec3 earthLocal = (instanceMatrix * vec4(xy, inward, 1.0)).xyz;
    vec3 normalEarth = normalize(earthLocal);

    // SphereGeometry longitude and UV orientation:
    // lon 0 => U 0.5, lon +90 => U 0.75, north => V 1.
    float longitude = atan(-normalEarth.z, normalEarth.x);
    vCloudUv = vec2(longitude / (2.0 * PI) + 0.5,
                   asin(clamp(normalEarth.y, -1.0, 1.0)) / PI + 0.5);

    vNormalWorld = normalize(mat3(modelMatrix) * normalEarth);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(earthLocal, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform sampler2D uCloudTexture;
  uniform sampler2D uCloudNext;
  uniform float uCloudBlend;
  uniform float uCloudPhase;
  uniform vec3 uSunDirection;

  ${cloudCoverShader}

  varying vec2 vPatchUv;
  varying vec2 vCloudUv;
  varying float vAge;
  varying float vStrength;
  varying float vSeed;
  varying vec3 vNormalWorld;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float value = 0.0;
    value += noise2D(p) * 0.56;
    value += noise2D(p * 2.13) * 0.28;
    value += noise2D(p * 4.21) * 0.16;
    return value;
  }
  float cloudLobe(vec2 p, vec2 center, vec2 scale, float seed) {
    vec2 q = (p - center) * scale;
    float distortion = (fbm(q * 3.8 + vec2(seed, seed * 1.19)) - 0.5) * 0.4;
    return 1.0 - smoothstep(0.30, 0.97, length(q) + distortion);
  }

  void main() {
    if (vAge < 0.0 || vAge > 1.0) discard;

    // A flash has a brief optical pulse, a dark gap, and a weaker second pulse.
    // Its footprint moves a little along the cloud. Nothing draws a bolt.
    float p1 = (vAge - 0.13) / 0.105;
    float p2 = (vAge - 0.55) / 0.14;
    float p3 = (vAge - 0.80) / 0.08;
    float firstPulse = exp(-p1 * p1);
    float secondPulse = 0.68 * exp(-p2 * p2);
    float lastPulse = 0.21 * exp(-p3 * p3);
    float lightPulse = firstPulse + secondPulse + lastPulse;

    float rotation = vSeed * 6.2831853;
    mat2 turn = mat2(cos(rotation), -sin(rotation),
                     sin(rotation), cos(rotation));
    vec2 p = turn * (vPatchUv * 2.0 - 1.0);
    float progress = smoothstep(0.04, 0.75, vAge);
    vec2 drift = vec2(progress * 0.24, progress * 0.065);

    // Clusters of distorted cloud-top illumination rather than circular sprites.
    float lobe1 = cloudLobe(p - drift, vec2(-0.26, 0.08),
                            vec2(1.4, 2.1), vSeed + 3.1);
    float lobe2 = cloudLobe(p - drift, vec2(0.14, -0.06),
                            vec2(2.1, 1.65), vSeed + 11.2);
    float lobe3 = cloudLobe(p - drift, vec2(0.34, 0.20),
                            vec2(2.3, 2.4), vSeed + 5.9);

    float shape = max(lobe1, max(lobe2 * 0.84, lobe3 * 0.54));
    float textureNoise = fbm(p * 5.0 + vec2(vSeed * 9.7));
    shape *= smoothstep(0.17, 0.78, textureNoise + 0.18);

    // Bright short-lived internal cloud-top structures.
    float brightCore = pow(max(0.0, shape), 2.7);
    float scattered = shape * (0.46 + 0.54 * textureNoise);

    // Use the same coverage and UV advection as the cloud volume.
    // Keep a small floor because its timestamp differs from the lightning feed.
    float cloudOpacity = cloudCover(vCloudUv);
    float cloudFactor = smoothstep(0.06, 0.65, cloudOpacity);

    float sun = dot(normalize(vNormalWorld), normalize(uSunDirection));
    float nightGain = mix(0.10, 1.18, 1.0 - smoothstep(-0.15, 0.35, sun));

    float alpha = (scattered * 0.32 + brightCore * 0.55)
        * lightPulse * vStrength * cloudFactor * nightGain;
    if (alpha < 0.008) discard;

    // Mostly white optical cloud-top emissions; blue is only a subtle tint.
    vec3 diffuseWhite = vec3(0.56, 0.69, 0.90);
    vec3 innerWhite = vec3(0.93, 0.97, 1.0);
    vec3 color = mix(diffuseWhite, innerWhite, clamp(brightCore * 2.4, 0.0, 1.0));
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.98));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(1, 1, 12, 12);
  const initialize = (name: string, value: number) => {
    geometry.setAttribute(
      name,
      new InstancedBufferAttribute(
        new Float32Array(MAX_INSTANCES).fill(value),
        1,
      ).setUsage(DynamicDrawUsage),
    );
  };
  initialize("aBorn", -10_000);
  initialize("aDuration", 0.3);
  initialize("aDiameter", 0.15);
  initialize("aStrength", 0);
  initialize("aSeed", 0);
  return geometry;
}

function setInstanceValue(
  geometry: PlaneGeometry,
  name: string,
  index: number,
  value: number,
) {
  const attribute = geometry.getAttribute(name) as InstancedBufferAttribute;
  attribute.setX(index, value);
  attribute.needsUpdate = true;
}

export default function EarthLightning({
  sunDirection,
  cloudFrames,
  active = true,
  animate = true,
}: {
  sunDirection: Vector3;
  cloudFrames: RefObject<CloudFrameState | null>;
  active?: boolean;
  animate?: boolean;
}) {
  // Local texture is a fallback while the current satellite images load.
  const [cloudTexture, polarCloudTexture] = useSceneTexture([
    earthTextures.clouds,
    earthTextures.previewClouds,
  ]);
  const meshRef = useRef<InstancedMesh>(null);
  const noaaRef = useRef<GeoPoint[]>([]);
  const euRef = useRef<ActivityData>(NO_ACTIVITY);
  const timeRef = useRef(0);
  const nextSlotRef = useRef(0);
  const spawnBudgetRef = useRef({ noaa: 0, eu: 0 });
  const dummyRef = useRef(new Object3D());
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reducedMotionRef.current = media.matches;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const geometry = useMemo(() => makeGeometry(), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uShellRadius: { value: CLOUD_GLOW_RADIUS },
          uCloudTexture: { value: cloudTexture },
          uCloudFallback: { value: polarCloudTexture },
          uCloudNext: { value: cloudTexture },
          uCloudBlend: { value: 0 },
          uCloudPhase: { value: 0 },
          uSunDirection: { value: sunDirection },
        },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        side: DoubleSide,
        toneMapped: false,
      }),
    [cloudTexture, polarCloudTexture, sunDirection],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const controller = new AbortController();
    let noaaBusy = false;
    let euBusy = false;

    async function fetchNoaa() {
      if (noaaBusy) return;
      noaaBusy = true;
      try {
        if (document.hidden) return;
        const response = await fetch(NOAA_URL, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`NOAA HTTP ${response.status}`);
        const result = (await response.json()) as NoaaPayload;
        if (!mounted) return;
        if (result.stale) {
          noaaRef.current = [];
          return;
        }
        const cutoff = Date.now() - 15 * 60_000;
        noaaRef.current = (result.flashes ?? []).filter(
          (p) =>
            validGeo(p) &&
            (!p.observedWindowStart ||
              Date.parse(p.observedWindowStart) >= cutoff),
        );
      } catch {
        if (mounted) noaaRef.current = [];
      } finally {
        noaaBusy = false;
      }
    }

    async function fetchEumetsat() {
      if (euBusy || document.hidden) return;
      euBusy = true;
      try {
        const version = Math.floor(Date.now() / EUMETSAT_POLL_MS);
        const response = await fetch(`${EUMETSAT_URL}?v=${version}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`EUMETSAT HTTP ${response.status}`);
        const mime = response.headers.get("content-type") ?? "";
        if (!mime.includes("image/png")) throw new Error(`Not a PNG: ${mime}`);
        const bitmap = await createImageBitmap(await response.blob());
        let activity: ActivityData;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 1024;
          canvas.height = 512;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Canvas 2D not supported");
          context.drawImage(bitmap, 0, 0, 1024, 512);
          const pixels = context.getImageData(0, 0, 1024, 512);
          activity = parseEumetsatImage(pixels.data, 1024, 512);
        } finally {
          bitmap.close();
        }
        if (mounted) euRef.current = activity;
      } catch {
        if (mounted) euRef.current = NO_ACTIVITY;
      } finally {
        euBusy = false;
      }
    }

    void fetchNoaa();
    void fetchEumetsat();
    const noaaTimer = window.setInterval(() => void fetchNoaa(), NOAA_POLL_MS);
    const euTimer = window.setInterval(
      () => void fetchEumetsat(),
      EUMETSAT_POLL_MS,
    );
    return () => {
      mounted = false;
      controller.abort();
      window.clearInterval(noaaTimer);
      window.clearInterval(euTimer);
    };
  }, [active]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!active || !animate || document.hidden || reducedMotionRef.current) {
      mesh.visible = false;
      cloudFrames.current?.lightning?.forEach((pulse) => pulse.set(0, 0, 0, 0));
      return;
    }
    mesh.visible = true;

    const dt = Math.min(rawDelta, 0.1);
    timeRef.current += dt;
    // Access live Three.js instances through the R3F mesh ref.
    // React Compiler forbids mutating render-scoped `material` / `geometry`
    // from the useFrame callback.
    const shaderMaterial = mesh.material as ShaderMaterial;
    const liveGeometry = mesh.geometry as PlaneGeometry;
    shaderMaterial.uniforms.uTime.value = timeRef.current;

    // No duplicate cloud fetch: reuse the live frames published by EarthClouds.
    const clouds = cloudFrames.current;
    if (clouds) {
      shaderMaterial.uniforms.uCloudTexture.value = clouds.from;
      shaderMaterial.uniforms.uCloudNext.value = clouds.to;
      shaderMaterial.uniforms.uCloudBlend.value = clouds.blend;
      shaderMaterial.uniforms.uCloudPhase.value = clouds.phase;
    }

    const noaa = noaaRef.current;
    const eu = euRef.current;
    const budget = spawnBudgetRef.current;

    // This is a time-compressed DISPLAY rate, not the original flash time.
    const rateNOAA = Math.min(9, noaa.length / 115);
    const rateEU = Math.min(9, eu.totalStrength / 25);
    budget.noaa = Math.min(2, budget.noaa + dt * rateNOAA);
    budget.eu = Math.min(2, budget.eu + dt * rateEU);

    const dummy = dummyRef.current;
    const spawn = (point: GeoPoint, power: number) => {
      const slot = nextSlotRef.current;
      nextSlotRef.current = (slot + 1) % MAX_INSTANCES;

      const normal = geoNormal(point);
      dummy.position.copy(normal).multiplyScalar(CLOUD_GLOW_RADIUS);
      dummy.quaternion.setFromUnitVectors(UP, normal);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;

      setInstanceValue(liveGeometry, "aBorn", slot, timeRef.current);
      setInstanceValue(
        liveGeometry,
        "aDuration",
        slot,
        0.18 + Math.random() * 0.2,
      );
      // The optical halo is slightly exaggerated for an orbital overview.
      setInstanceValue(liveGeometry, "aDiameter", slot, 0.04 + 0.035 * power);
      setInstanceValue(liveGeometry, "aStrength", slot, power);
      setInstanceValue(liveGeometry, "aSeed", slot, Math.random());
    };

    while (budget.noaa >= 1 && noaa.length) {
      budget.noaa -= 1;
      const p = noaa[Math.floor(Math.random() * noaa.length)];
      spawn(p, 0.76 + Math.random() * 0.24);
    }
    while (budget.eu >= 1 && eu.points.length) {
      budget.eu -= 1;
      const p = sampleEumetsat(eu);
      if (p) spawn(p, 0.42 + p.strength * 0.55);
    }

    // Illuminate the same cloud volume from within, using the existing flash slots.
    const pulses = clouds?.lightning;
    if (pulses) {
      pulses.forEach((pulse) => pulse.set(0, 0, 0, 0));
      const born = liveGeometry.getAttribute("aBorn");
      const durations = liveGeometry.getAttribute("aDuration");
      const strengths = liveGeometry.getAttribute("aStrength");
      for (let slot = 0; slot < MAX_INSTANCES; slot++) {
        const age = (timeRef.current - born.getX(slot)) / durations.getX(slot);
        if (age < 0 || age > 1) continue;
        const energy =
          (Math.exp(-(((age - 0.13) / 0.105) ** 2)) +
            0.68 * Math.exp(-(((age - 0.55) / 0.14) ** 2)) +
            0.21 * Math.exp(-(((age - 0.8) / 0.08) ** 2))) *
          strengths.getX(slot);
        let index = Math.min(MAX_CLOUD_FLASHES, pulses.length) - 1;
        if (index < 0 || energy <= pulses[index].w) continue;
        while (index > 0 && energy > pulses[index - 1].w) {
          pulses[index].copy(pulses[index - 1]);
          index--;
        }
        const offset = slot * 16;
        const matrix = mesh.instanceMatrix.array;
        pulses[index].set(
          matrix[offset + 12],
          matrix[offset + 13],
          matrix[offset + 14],
          energy,
        );
      }
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES]}
      frustumCulled={false}
      renderOrder={11}
    />
  );
}
