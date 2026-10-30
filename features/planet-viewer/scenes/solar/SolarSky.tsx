"use client";

import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
} from "three";
import { useThree } from "@react-three/fiber";

// The sky is an artistic star distribution, not a Gaia/Hipparcos star catalog.
// Fixed seed avoids random flicker when React remounts the scene.
function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starGeometry() {
  const random = randomSource(0x0ab17a1);
  const count = 16000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const strengths = new Float32Array(count);
  const galacticNormal = new Vector3(0.35, 0.80, 0.08).normalize();
  const east = new Vector3().crossVectors(galacticNormal, new Vector3(0, 0, 1)).normalize();
  const north = new Vector3().crossVectors(galacticNormal, east).normalize();

  for (let i = 0; i < count; i++) {
    const concentrated = i >= 8500;
    const azimuth = random() * Math.PI * 2;
    const latitude = concentrated
      ? (random() + random() + random() + random() - 2) * 0.12
      : Math.asin(random() * 2 - 1);
    const plane = Math.cos(latitude);
    const x = concentrated
      ? (east.x * Math.cos(azimuth) + north.x * Math.sin(azimuth)) * plane + galacticNormal.x * Math.sin(latitude)
      : plane * Math.cos(azimuth);
    const y = concentrated
      ? (east.y * Math.cos(azimuth) + north.y * Math.sin(azimuth)) * plane + galacticNormal.y * Math.sin(latitude)
      : Math.sin(latitude);
    const z = concentrated
      ? (east.z * Math.cos(azimuth) + north.z * Math.sin(azimuth)) * plane + galacticNormal.z * Math.sin(latitude)
      : plane * Math.sin(azimuth);
    positions.set([x * 90, y * 90, z * 90], i * 3);

    const tone = random();
    const color = tone < 0.14
      ? [1.0, 0.78, 0.59]
      : tone < 0.36
        ? [0.69, 0.82, 1.0]
        : [0.90, 0.94, 1.0];
    colors.set(color, i * 3);
    const bright = Math.pow(random(), 17);
    sizes[i] = 0.95 + random() * 0.85 + bright * 3.8;
    strengths[i] = 0.16 + random() * 0.56 + bright * 0.52;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aStrength", new Float32BufferAttribute(strengths, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const starVertexShader = "\nattribute vec3 aColor;\nattribute float aSize;\nattribute float aStrength;\nvarying vec3 vColor;\nvarying float vStrength;\nuniform float uDpr;\nvoid main() {\n  vColor = aColor;\n  vStrength = aStrength;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  gl_PointSize = clamp(aSize * uDpr, 1.0, 6.0);\n}\n";
const starFragmentShader = "\nprecision mediump float;\nvarying vec3 vColor;\nvarying float vStrength;\nvoid main() {\n  float r = length(gl_PointCoord - vec2(0.5)) * 2.0;\n  float halo = pow(1.0 - smoothstep(0.02, 1.0, r), 2.2);\n  float core = 1.0 - smoothstep(0.03, 0.33, r);\n  float alpha = (halo * 0.55 + core * 0.45) * vStrength;\n  if (alpha < 0.015) discard;\n  gl_FragColor = vec4(vColor, alpha);\n}\n";
const skyVertexShader = "\nvarying vec3 vDirection;\nvoid main() {\n  vDirection = position;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}\n";
const skyFragmentShader = "\nprecision mediump float;\nvarying vec3 vDirection;\nfloat hash3(vec3 p) {\n  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);\n}\nfloat noise3(vec3 p) {\n  vec3 i = floor(p);\n  vec3 f = fract(p);\n  f = f*f*(3.0-2.0*f);\n  float a = mix(hash3(i), hash3(i+vec3(1.0,0.0,0.0)), f.x);\n  float b = mix(hash3(i+vec3(0.0,1.0,0.0)), hash3(i+vec3(1.0,1.0,0.0)), f.x);\n  float c = mix(hash3(i+vec3(0.0,0.0,1.0)), hash3(i+vec3(1.0,0.0,1.0)), f.x);\n  float d = mix(hash3(i+vec3(0.0,1.0,1.0)), hash3(i+vec3(1.0,1.0,1.0)), f.x);\n  return mix(mix(a,b,f.y), mix(c,d,f.y), f.z);\n}\nfloat fbm(vec3 p) {\n  float v = 0.0;\n  float a = 0.5;\n  for (int i=0; i<4; i++) {\n    v += a*noise3(p);\n    p *= 2.05;\n    a *= 0.5;\n  }\n  return v;\n}\nvoid main() {\n  vec3 direction = normalize(vDirection);\n  vec3 galacticNormal = normalize(vec3(0.35, 0.80, 0.08));\n  float latitude = abs(dot(direction, galacticNormal));\n  float wide = exp(-pow(latitude / 0.28, 2.0));\n  float thin = exp(-pow(latitude / 0.085, 2.0));\n  float clouds = fbm(direction * 21.0);\n  float structure = fbm(direction * 10.0 + 23.0);\n  float dust = smoothstep(0.48, 0.7, structure);\n  float light = wide * (0.2 + 0.8*clouds) * (1.0 - 0.74*dust);\n  vec3 sky = vec3(0.004, 0.008, 0.018);\n  sky += vec3(0.085, 0.125, 0.20) * light * 0.37;\n  sky += vec3(0.13, 0.105, 0.10) * thin * light * 0.13;\n  gl_FragColor = vec4(sky, 1.0);\n}\n";

export function SolarSky() {
  const geometry = useMemo(starGeometry, []);
  const dpr = useThree((state) => state.gl.getPixelRatio());
  const uniforms = useMemo(() => ({ uDpr: { value: dpr } }), [dpr]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <>
      <mesh frustumCulled={false}>
        <sphereGeometry args={[120, 64, 40]} />
        <shaderMaterial
          side={BackSide}
          vertexShader={skyVertexShader}
          fragmentShader={skyFragmentShader}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          vertexShader={starVertexShader}
          fragmentShader={starFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </>
  );
}
