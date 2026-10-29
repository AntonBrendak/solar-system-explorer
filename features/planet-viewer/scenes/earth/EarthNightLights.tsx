"use client";

import { useSceneTexture } from "../../model/useSceneTexture";

import { useEffect, useMemo } from "react";
import { earthTextures } from "./textures";

import { AdditiveBlending, SRGBColorSpace, type Vector3 } from "three";

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;

    vWorldNormal = normalize(
      mat3(modelMatrix) * normal
    );

    gl_Position =
      projectionMatrix *
      modelViewMatrix *
      vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uNightMap;
  uniform vec3 uSunDirection;
  uniform float uIntensity;

  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 sun = normalize(uSunDirection);

    float sunlight = dot(normal, sun);

    // 1 = night, 0 = day.
    float night = 1.0 - smoothstep(
      -0.18,
       0.12,
       sunlight
    );

    vec3 cityColor = texture2D(
      uNightMap,
      vUv
    ).rgb;

    // Suppress the dark background in the night texture.
    float brightness = dot(
      cityColor,
      vec3(0.2126, 0.7152, 0.0722)
    );

    float lights = smoothstep(
      0.025,
      0.20,
      brightness
    );

    // Restrict emissive city lights to the night side.
    gl_FragColor = vec4(
      cityColor * uIntensity,
      night * lights
    );

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function EarthNightLights({
  sunDirection,
}: {
  sunDirection: Vector3;
}) {
  const source = useSceneTexture(earthTextures.night);

  // Keep the loader's cached source unchanged.
  const nightTexture = useMemo(() => {
    const texture = source.clone();

    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    return texture;
  }, [source]);

  useEffect(() => {
    return () => nightTexture.dispose();
  }, [nightTexture]);

  const uniforms = useMemo(
    () => ({
      uNightMap: {
        value: nightTexture,
      },
      uSunDirection: {
        value: sunDirection,
      },
      uIntensity: {
        value: 1.1,
      },
    }),
    [nightTexture, sunDirection],
  );

  return (
    <mesh renderOrder={1}>
      <sphereGeometry args={[2.004, 128, 128]} />

      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
