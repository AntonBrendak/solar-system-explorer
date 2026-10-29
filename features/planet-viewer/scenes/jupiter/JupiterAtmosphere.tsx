"use client";

import { useSceneTexture } from "../../model/useSceneTexture";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Mesh,
} from "three";

// SETTINGS — EXISTING ATMOSPHERE

const DEBUG_WIND = false;
const DEBUG_LIGHTNING = false;

const JUPITER_RADIUS_M = 71_492_000;
const TAU = Math.PI * 2;

const EPOCH_MS = Date.UTC(2026, 9, 28);

const WIND_ACCELERATION = DEBUG_WIND ? 12_000 : 1;

const BAND_EDGES = [
  0, 0.1, 0.205, 0.32, 0.47, 0.565, 0.655, 0.745, 0.835, 0.925, 1,
] as const;

const BAND_SPEEDS_MPS = [
  -70, 90, -120, 110, -100, 85, -115, 105, -80, 60,
] as const;

const BAND_COUNT = BAND_SPEEDS_MPS.length;

const SPOT_BAND = 3;
const SPOT_U = 0.368;
const SPOT_V = 0.388;

const SPOT_PERIOD_MS = DEBUG_WIND ? 240_000 : 6 * 86_400_000;

const SMALL_PERIOD_MS = DEBUG_WIND ? 180_000 : 3 * 86_400_000;

const FLASH_WINDOW_MS = DEBUG_LIGHTNING ? 2_500 : 600_000;

const FLASH_DURATION_MS = 1_100;

// NEW ATMOSPHERIC APPEARANCE

// Controls haze only inside the sphere's rim.
// Zero disables the extra haze.
const LIMB_HAZE_STRENGTH = 0.25;

// Very subtle brightness variation
// between light and dark cloud details.
const CLOUD_DEPTH_STRENGTH = 0.055;

type NumberUniform = {
  value: number;
};

type VectorUniform = {
  value: Vector2;
};

type Props = {
  textureUrl: string;
  active?: boolean;
};

// HELPERS

function random01(index: number, salt: number): number {
  let x = Math.imul(index ^ salt, 0x9e3779b1);

  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;

  return (x >>> 0) / 0x1_0000_0000;
}

function cyclicPhase(elapsedMs: number, periodMs: number): number {
  return (((elapsedMs % periodMs) + periodMs) % periodMs) / periodMs;
}

// COMPONENT

export default function JupiterAtmosphere({
  textureUrl,
  active = true,
}: Props) {
  const originalMap = useSceneTexture(textureUrl);

  const map = useMemo(() => {
    const texture = originalMap.clone();

    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.needsUpdate = true;

    return texture;
  }, [originalMap]);

  useEffect(() => {
    return () => map.dispose();
  }, [map]);

  const meshRef = useRef<Mesh>(null);

  const bandPhasesRef = useRef<Float32Array | null>(null);

  const spotRef = useRef<NumberUniform | null>(null);

  const smallRef = useRef<NumberUniform | null>(null);

  const flashRef = useRef<NumberUniform | null>(null);

  const flashUvRef = useRef<VectorUniform | null>(null);

  const debugStartRef = useRef<number | null>(null);

  // ANIMATION

  useFrame(({ camera }) => {
    if (!active) {
      if (flashRef.current) {
        flashRef.current.value = 0;
      }
      return;
    }

    const now = Date.now();

    if (debugStartRef.current === null) {
      debugStartRef.current = now;
    }

    const elapsed = DEBUG_WIND ? now - debugStartRef.current : now - EPOCH_MS;

    // INDEPENDENT BANDS

    const phases = bandPhasesRef.current;

    if (phases) {
      const seconds = elapsed / 1000;

      for (let i = 0; i < BAND_COUNT; i++) {
        const turns =
          (seconds * BAND_SPEEDS_MPS[i] * WIND_ACCELERATION) /
          (TAU * JUPITER_RADIUS_M);

        phases[i] = ((turns % 1) + 1) % 1;
      }
    }

    // VORTICES

    if (spotRef.current) {
      spotRef.current.value = cyclicPhase(elapsed, SPOT_PERIOD_MS) * TAU;
    }

    if (smallRef.current) {
      smallRef.current.value = cyclicPhase(elapsed, SMALL_PERIOD_MS) * TAU;
    }

    // LIGHTNING

    const flash = flashRef.current;
    const flashUv = flashUvRef.current;

    if (!flash || !flashUv) return;

    flash.value = 0;

    const slot = Math.floor(now / FLASH_WINDOW_MS);

    if (!DEBUG_LIGHTNING && random01(slot, 11) >= 0.07) {
      return;
    }

    const flashAt =
      slot * FLASH_WINDOW_MS +
      (DEBUG_LIGHTNING
        ? 250
        : random01(slot, 12) * (FLASH_WINDOW_MS - FLASH_DURATION_MS));

    const age = now - flashAt;

    if (age < 0 || age >= FLASH_DURATION_MS) {
      return;
    }

    const first = Math.exp(-Math.pow((age - 180) / 100, 2));

    const second = 0.65 * Math.exp(-Math.pow((age - 570) / 145, 2));

    flash.value = (first + second) * (DEBUG_LIGHTNING ? 3.5 : 1);

    // FLASH POSITION

    if (DEBUG_LIGHTNING && meshRef.current) {
      const localCamera = meshRef.current
        .worldToLocal(camera.getWorldPosition(new Vector3()))
        .normalize();

      const phi = Math.atan2(localCamera.z, -localCamera.x);

      const cameraU = (((phi / TAU) % 1) + 1) % 1;

      const cameraV =
        0.5 + Math.asin(Math.max(-1, Math.min(1, localCamera.y))) / Math.PI;

      const u = (((cameraU + (random01(slot, 21) - 0.5) * 0.16) % 1) + 1) % 1;

      const v = Math.max(
        0.15,
        Math.min(0.85, cameraV + (random01(slot, 22) - 0.5) * 0.14),
      );

      flashUv.value.set(u, v);
    } else {
      const locations: [number, number][] = [
        [0.16, 0.72],
        [0.29, 0.32],
        [0.48, 0.68],
        [0.67, 0.31],
        [0.83, 0.76],
        [0.93, 0.42],
      ];

      const location =
        locations[Math.floor(random01(slot, 13) * locations.length)];

      flashUv.value.set(location[0], location[1]);
    }
  });

  // MATERIAL

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[2, 192, 128]} />

      <meshStandardMaterial
        map={map}
        color="#ffffff"
        roughness={1}
        metalness={0}
        customProgramCacheKey={() => "jupiter-anchored-bands-limb-v16"}
        onBeforeCompile={(shader) => {
          // UNIFORMS

          const phases = new Float32Array(BAND_COUNT);

          const spotUniform: NumberUniform = {
            value: 0,
          };

          const smallUniform: NumberUniform = {
            value: 0,
          };

          const flashUniform: NumberUniform = {
            value: 0,
          };

          const flashUvUniform: VectorUniform = {
            value: new Vector2(0, 0),
          };

          shader.uniforms.uBandPhases = {
            value: phases,
          };

          shader.uniforms.uSpotPhase = spotUniform;

          shader.uniforms.uSmallPhase = smallUniform;

          shader.uniforms.uFlashIntensity = flashUniform;

          shader.uniforms.uFlashUv = flashUvUniform;

          bandPhasesRef.current = phases;
          spotRef.current = spotUniform;
          smallRef.current = smallUniform;
          flashRef.current = flashUniform;
          flashUvRef.current = flashUvUniform;

          // GLSL DECLARATIONS

          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <common>",
            `
              #include <common>

              uniform float uBandPhases[${BAND_COUNT}];
              uniform float uSpotPhase;
              uniform float uSmallPhase;
              uniform float uFlashIntensity;
              uniform vec2 uFlashUv;
              `,
          );

          // GLSL HELPERS

          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <map_pars_fragment>",
            `
              #include <map_pars_fragment>

              #ifdef USE_MAP

              float jupiterEdge(int i) {
                ${BAND_EDGES.map(
                  (edge, i) => `if (i == ${i}) return ${edge.toFixed(6)};`,
                ).join("\n")}
                return 1.0;
              }

              int jupiterBand(float v) {
                ${BAND_EDGES.slice(1, -1)
                  .map((edge, i) => `if (v < ${edge.toFixed(6)}) return ${i};`)
                  .join("\n")}
                return ${BAND_COUNT - 1};
              }

              vec4 jupiterSmallVortex(
                vec4 baseColor,
                vec2 worldUv,
                vec2 sourceCenter,
                vec2 size,
                float bandPhase,
                float angle,
                float strength,
                float edgeMask
              ) {
                vec2 center = vec2(
                  fract(
                    sourceCenter.x - bandPhase
                  ),
                  sourceCenter.y
                );

                vec2 delta =
                  worldUv - center;

                delta.x -= floor(
                  delta.x + 0.5
                );

                vec2 local = delta / size;
                float r = length(local);

                if (r >= 1.12) {
                  return baseColor;
                }

                float mask =
                  smoothstep(0.14, 0.36, r) *
                  (
                    1.0 - smoothstep(
                      0.72, 1.12, r
                    )
                  ) *
                  strength *
                  edgeMask;

                float c = cos(angle);
                float s = sin(angle);

                vec2 rotated = vec2(
                  local.x * c -
                  local.y * s,
                  local.x * s +
                  local.y * c
                );

                vec4 source = texture2D(
                  map,
                  sourceCenter + rotated * size
                );

                return mix(
                  baseColor,
                  source,
                  mask
                );
              }

              #endif
              `,
          );

          // INDEPENDENT CLOUD BANDS

          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <map_fragment>",
            `
              #ifdef USE_MAP

              vec2 uv = vMapUv;

              // Wavy periodic band boundaries.
              float wavyV = clamp(
                uv.y +
                0.0020 * sin(
                  uv.x * 6.2831853 * 5.0 +
                  uv.y * 9.0
                ) +
                0.0010 * sin(
                  uv.x * 6.2831853 * 11.0 -
                  uv.y * 13.0
                ),
                0.0,
                1.0
              );

              int band = jupiterBand(wavyV);

              float low = jupiterEdge(band);
              float high = jupiterEdge(band + 1);

              // Static texture anchors the
              // transition between bands.
              float edgeDistance = min(
                wavyV - low,
                high - wavyV
              );

              float transitionWidth = min(
                0.026,
                (high - low) * 0.38
              );

              float movingWeight = smoothstep(
                0.0,
                transitionWidth,
                edgeDistance
              );

              vec4 staticColor =
                texture2D(map, uv);

              vec4 movingColor = texture2D(
                map,
                vec2(
                  uv.x + uBandPhases[band],
                  uv.y
                )
              );

              vec4 color = mix(
                staticColor,
                movingColor,
                movingWeight
              );

              // GREAT RED SPOT

              float spotBandPhase =
                uBandPhases[${SPOT_BAND}];

              vec2 spotCenter = vec2(
                fract(
                  ${SPOT_U.toFixed(6)} -
                  spotBandPhase
                ),
                ${SPOT_V.toFixed(6)}
              );

              vec2 spotSize =
                vec2(0.055, 0.040);

              vec2 spotDelta = uv - spotCenter;

              spotDelta.x -= floor(
                spotDelta.x + 0.5
              );

              vec2 spotLocal =
                spotDelta / spotSize;

              float spotRadius =
                length(spotLocal);

              if (spotRadius < 1.28) {
                float protection =
                  1.0 - smoothstep(
                    1.0,
                    1.28,
                    spotRadius
                  );

                vec4 spotBase = texture2D(
                  map,
                  vec2(
                    uv.x + spotBandPhase,
                    uv.y
                  )
                );

                color = mix(
                  color,
                  spotBase,
                  protection * movingWeight
                );

                float c = cos(-uSpotPhase);
                float s = sin(-uSpotPhase);

                vec2 rotated = vec2(
                  spotLocal.x * c -
                  spotLocal.y * s,
                  spotLocal.x * s +
                  spotLocal.y * c
                );

                vec2 sampleUv =
                  vec2(
                    ${SPOT_U.toFixed(6)},
                    ${SPOT_V.toFixed(6)}
                  ) +
                  rotated * spotSize;

                float vortexMask =
                  smoothstep(
                    0.18, 0.48, spotRadius
                  ) *
                  (
                    1.0 - smoothstep(
                      0.75,
                      1.10,
                      spotRadius
                    )
                  );

                color = mix(
                  color,
                  texture2D(map, sampleUv),
                  vortexMask * movingWeight
                );
              }

              // SMALL VORTICES

              color = jupiterSmallVortex(
                color,
                uv,
                vec2(0.16, 0.72),
                vec2(0.021, 0.015),
                uBandPhases[6],
                -uSmallPhase,
                0.32,
                movingWeight
              );

              color = jupiterSmallVortex(
                color,
                uv,
                vec2(0.67, 0.31),
                vec2(0.027, 0.017),
                uBandPhases[2],
                uSmallPhase,
                0.28,
                movingWeight
              );

              color = jupiterSmallVortex(
                color,
                uv,
                vec2(0.83, 0.76),
                vec2(0.019, 0.013),
                uBandPhases[7],
                -uSmallPhase,
                0.30,
                movingWeight
              );

              diffuseColor *= color;

              #endif
              `,
          );

          // LIGHTNING EMISSION

          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            `
              #include <emissivemap_fragment>

              #ifdef USE_MAP

              vec2 d = vMapUv - uFlashUv;

              d.x -= floor(d.x + 0.5);

              d.x *= max(
                sin(vMapUv.y * 3.14159265),
                0.12
              );

              vec2 coreUv =
                d / vec2(0.007, 0.007);

              vec2 haloUv =
                d / vec2(0.030, 0.025);

              float core = exp(
                -dot(coreUv, coreUv) * 1.4
              );

              float halo = exp(
                -dot(haloUv, haloUv) * 1.8
              );

              totalEmissiveRadiance +=
                vec3(0.65, 0.82, 1.0) *
                uFlashIntensity *
                (
                  core * 1.6 +
                  halo * 0.28
                );

              #endif
              `,
          );

          // NEW: ATMOSPHERIC DEPTH + LIMB HAZE

          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <opaque_fragment>",
            `
              #ifdef USE_MAP

              // Both vectors are in view space.
              // Fresnel-like increase toward
              // the edge of Jupiter's disc.

              float limbFacing = clamp(
                dot(
                  normalize(normal),
                  normalize(vViewPosition)
                ),
                0.0,
                1.0
              );

              float limb = pow(
                1.0 - limbFacing,
                2.8
              );

              // Extract the existing direct
              // illumination from Three.js.
              // This prevents a bright halo
              // on the night side.

              float directSun = clamp(
                dot(
                  reflectedLight.directDiffuse,
                  vec3(0.2126, 0.7152, 0.0722)
                ) * 0.65,
                0.0,
                1.0
              );

              // Very subtle cloud depth.
              float cloudLuminance = dot(
                diffuseColor.rgb,
                vec3(0.2126, 0.7152, 0.0722)
              );

              outgoingLight *=
                1.0 +
                (cloudLuminance - 0.5) *
                ${CLOUD_DEPTH_STRENGTH.toFixed(4)} *
                directSun;

              // Soft atmospheric scattering
              // on the illuminated limb.
              // No extra sphere or opacity.

              float hazeAmount =
                limb *
                directSun *
                ${LIMB_HAZE_STRENGTH.toFixed(4)};

              vec3 hazeColor =
                vec3(0.57, 0.57, 0.59) *
                directSun;

              outgoingLight = mix(
                outgoingLight,
                hazeColor,
                hazeAmount
              );

              #endif

              #include <opaque_fragment>
              `,
          );
        }}
      />
    </mesh>
  );
}
