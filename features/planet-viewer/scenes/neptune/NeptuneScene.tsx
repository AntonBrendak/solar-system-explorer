"use client";

import { useSceneTexture } from "../../model/useSceneTexture";

import { useEffect, useMemo, useRef } from "react";

import { useFrame } from "@react-three/fiber";

import { RepeatWrapping, SRGBColorSpace } from "three";

import type { PlanetSceneProps } from "../../model/types";

// CONFIGURATION

// 1 = physical wind speed.
// Higher values accelerate the visual simulation.
const WIND_TIME_SCALE = 120;

// Approximate equatorial circumference, metres.
const NEPTUNE_CIRCUMFERENCE_M = 155_600_000;

// TYPES

type SurfaceProps = PlanetSceneProps & {
  textureUrl: string;
  segments: number;
};

// SURFACE

function NeptuneSurface({
  textureUrl,
  segments,
  active,
  animate,
}: SurfaceProps) {
  const original = useSceneTexture(textureUrl);

  // TEXTURE

  const map = useMemo(() => {
    const texture = original.clone();

    texture.colorSpace = SRGBColorSpace;

    // Critical: UV coordinates are allowed
    // to continue beyond the [0, 1] range.
    // The GPU performs periodic wrapping.
    texture.wrapS = RepeatWrapping;

    texture.needsUpdate = true;

    return texture;
  }, [original]);

  useEffect(() => {
    return () => {
      map.dispose();
    };
  }, [map]);

  // ANIMATION UNIFORM

  // Ref is mutable without React rerenders.
  // Both Lite and Full use the shared Canvas clock.
  const timeUniformRef = useRef({
    value: 0,
  });

  useFrame(({ clock }) => {
    if (!active || !animate) {
      return;
    }

    timeUniformRef.current.value = clock.elapsedTime;
  });

  // SCENE

  return (
    <mesh scale={[1, 0.983, 1]}>
      <sphereGeometry args={[2, segments, segments]} />

      <meshStandardMaterial
        map={map}
        roughness={1}
        metalness={0}
        customProgramCacheKey={() => "neptune-continuous-winds-v2"}
        onBeforeCompile={(shader) => {
          // UNIFORMS

          shader.uniforms.uNeptuneTime = timeUniformRef.current;

          shader.uniforms.uNeptuneSpeed = {
            value: WIND_TIME_SCALE,
          };

          shader.uniforms.uNeptuneCircumference = {
            value: NEPTUNE_CIRCUMFERENCE_M,
          };

          // GLSL DECLARATIONS

          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <common>",
            `
              #include <common>

              uniform float uNeptuneTime;
              uniform float uNeptuneSpeed;
              uniform float uNeptuneCircumference;
              `,
          );

          // CUSTOM MAP SAMPLING

          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <map_fragment>",
            /* glsl */ `
              #ifdef USE_MAP

                vec2 flowUv = vMapUv;

                // Latitude: -PI/2 to +PI/2.
                float latitude =
                  (flowUv.y - 0.5) * PI;

                // Smooth polar guard.
                // Prevent extreme speed
                // close to the poles.
                float cosLatitude =
                  cos(latitude);

                float latitudeFactor =
                  sqrt(
                    0.12 +
                    0.88 *
                    cosLatitude *
                    cosLatitude
                  );

                // ZONAL WINDS

                // Smooth continuous
                // latitude-dependent flow.
                //
                // No hard band boundaries.
                // Positive/negative values
                // produce opposing currents.

                float windVelocity =
                  110.0
                  + 260.0 * sin(
                    latitude * 6.5 + 0.35
                  )
                  - 190.0 * sin(
                    latitude * 13.0 - 0.8
                  );

                // LONGITUDE MOVEMENT

                float longitudeShift =
                  uNeptuneTime *
                  uNeptuneSpeed *
                  windVelocity /
                  (
                    uNeptuneCircumference *
                    latitudeFactor
                  );

                // CONTINUOUS UV

                // IMPORTANT:
                // Do not use fract() here.
                //
                // RepeatWrapping handles
                // longitude periodicity in
                // the texture sampler.
                //
                // This preserves smooth
                // UV derivatives for mipmaps.

                vec2 sampleUv = vec2(
                  flowUv.x + longitudeShift,
                  flowUv.y
                );

                // TEXTURE SAMPLE

                vec4 sampledDiffuseColor =
                  texture2D(
                    map,
                    sampleUv
                  );

                #ifdef DECODE_VIDEO_TEXTURE
                  sampledDiffuseColor =
                    sRGBTransferEOTF(
                      sampledDiffuseColor
                    );
                #endif

                diffuseColor *=
                  sampledDiffuseColor;

              #endif
              `,
          );
        }}
      />
    </mesh>
  );
}

// LITE

export function NeptuneLite({ active, animate }: PlanetSceneProps) {
  return (
    <NeptuneSurface
      textureUrl="/textures/neptune/neptune-lite.webp"
      segments={48}
      active={active}
      animate={animate}
    />
  );
}

// FULL

export default function NeptuneScene({ active, animate }: PlanetSceneProps) {
  return (
    <NeptuneSurface
      textureUrl="/textures/neptune/neptune-8k.webp"
      segments={128}
      active={active}
      animate={animate}
    />
  );
}
