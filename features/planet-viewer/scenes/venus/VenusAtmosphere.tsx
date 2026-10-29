"use client";

import { useMemo } from "react";
import { FrontSide, type Vector3 } from "three";

const vertexShader = /* glsl */ `
  uniform vec3 uSunDirection;

  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vSunDirection;

  void main() {
    vec4 viewPosition =
      modelViewMatrix * vec4(position, 1.0);

    vNormal = normalize(normalMatrix * normal);

    vViewDirection =
      normalize(-viewPosition.xyz);

    vSunDirection = normalize(
      (viewMatrix * vec4(uSunDirection, 0.0)).xyz
    );

    gl_Position =
      projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vSunDirection;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(vViewDirection);
    vec3 sunDir = normalize(vSunDirection);

    float facing = clamp(
      dot(n, viewDir),
      0.0,
      1.0
    );

    float rim = pow(
      1.0 - facing,
      2.8
    );

    float edgeFade = smoothstep(
      0.0,
      0.16,
      facing
    );

    float sunlight = smoothstep(
      -0.20,
      0.45,
      dot(n, sunDir)
    );

    vec3 cream = vec3(1.0, 0.94, 0.83);
    vec3 gold = vec3(1.0, 0.80, 0.59);

    vec3 color = mix(
      cream,
      gold,
      sunlight * 0.65
    );

    float alpha =
      rim *
      edgeFade *
      (0.06 + 0.50 * sunlight);

    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function VenusAtmosphere({
  sunDirection,
}: {
  sunDirection: Vector3;
}) {
  const uniforms = useMemo(
    () => ({
      uSunDirection: {
        value: sunDirection,
      },
    }),
    [sunDirection],
  );

  return (
    <mesh renderOrder={2}>
      <sphereGeometry args={[2.04, 128, 128]} />

      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        depthTest
        side={FrontSide}
      />
    </mesh>
  );
}
