"use client";

import {
  useEffect,
  useMemo,
  useRef,
} from "react";

import { useFrame } from "@react-three/fiber";

import {
  FrontSide,
  ShaderMaterial,
  Vector3,
} from "three";

import { useUranusSun } from "./UranusEnvironment";

type Props = {
  active: boolean;
  animate: boolean;
  segments?: number;
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;

    vec4 worldPosition =
      modelMatrix * vec4(position, 1.0);

    vWorldNormal =
      normalize(mat3(modelMatrix) * normal);

    vViewDir =
      normalize(cameraPosition - worldPosition.xyz);

    gl_Position =
      projectionMatrix *
      viewMatrix *
      worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDirection;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 sunDir = normalize(uSunDirection);
    vec3 viewDir = normalize(vViewDir);

    float dayLight =
      max(dot(normal, sunDir), 0.0);

    float rim =
      pow(
        1.0 - max(dot(normal, viewDir), 0.0),
        3.1
      );

    // Очень слабые полосы, без "юпитерного" вида.
    float lat = vUv.y;

    float slowDrift = uTime * 0.004;

    float waveA =
      sin((lat * 3.8 + slowDrift) * 6.28318530718);

    float waveB =
      sin((lat * 8.5 - slowDrift * 0.7) * 6.28318530718);

    float bandsRaw =
      0.5 + 0.5 * (waveA * 0.6 + waveB * 0.4);

    float bandDelta =
      (bandsRaw - 0.5) * 0.075;

    // Базовый цвет Урана.
    vec3 baseColor =
      vec3(0.74, 0.90, 0.95);

    vec3 brightColor =
      vec3(0.86, 0.97, 1.0);

    vec3 color =
      mix(
        baseColor,
        brightColor,
        0.22 * dayLight + 0.42 * rim
      );

    // Полосы делаем почти незаметными.
    color *= 1.0 + bandDelta * (0.25 + 0.75 * dayLight);

    // Тонкая атмосфера.
    float faceAlpha =
      0.018 + 0.010 * dayLight;

    float limbAlpha =
      rim * (0.08 + 0.10 * dayLight);

    float alpha =
      faceAlpha + limbAlpha;

    gl_FragColor = vec4(color, alpha);
  }
`;

export default function UranusAtmosphere({
  active,
  animate,
  segments = 128,
}: Props) {
  const sunDirection = useUranusSun();

  const materialRef =
    useRef<ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunDirection: {
        value: sunDirection as Vector3,
      },
    }),
    [sunDirection]
  );

  useFrame((_, delta) => {
    if (
      !active ||
      !animate ||
      !materialRef.current
    ) {
      return;
    }

    materialRef.current.uniforms.uTime.value +=
      delta;
  });

  useEffect(() => {
    return () => {
      materialRef.current?.dispose();
    };
  }, []);

  return (
    <mesh scale={[1.004, 0.981, 1.004]}>
      <sphereGeometry
        args={[2, segments, segments]}
      />

      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest
        side={FrontSide}
      />
    </mesh>
  );
}