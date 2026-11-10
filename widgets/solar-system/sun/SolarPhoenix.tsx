"use client";

import { useContext, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { GpuResourceContext } from "@/shared/lib/gpu-resource-context";
import {
  AdditiveBlending,
  CatmullRomCurve3,
  Color,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from "three";

import { SUN_FRAGMENT, SUN_VERTEX } from "./shaders";
import type { SimulationStore } from "../simulation/simulation-store";

export const SUN_RADIUS_KM = 695_700;
export const SUN_RADIUS = 2;

export const kmToSceneUnits = (km: number) => (km / SUN_RADIUS_KM) * SUN_RADIUS;

const MS_PER_DAY = 86_400_000;
const SECONDS_PER_DAY = 86_400;
const SIMULATION_SPEED = 60;
const SOLAR_AXIS_TILT = (7.25 * Math.PI) / 180;
const DEG = Math.PI / 180;

function random01(a: number, b: number) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;

  return n - Math.floor(n);
}

type Loop = {
  geometry: TubeGeometry;
  latitude: number;
  phase: number;
  color: Color;
};

function createProminences(): Loop[] {
  return Array.from({ length: 8 }, (_, i) => {
    const latitude = (i % 2 === 0 ? 1 : -1) * (8 + random01(i, 3) * 34) * DEG;

    const polar = Math.PI / 2 - latitude;
    const start = random01(i, 1) * Math.PI * 2;
    const span = (random01(i, 2) - 0.5) * 0.65;
    const height = 0.16 + random01(i, 4) * 0.48;
    const thickness = 0.007 + random01(i, 5) * 0.011;

    const points = Array.from({ length: 25 }, (_, j) => {
      const t = j / 24;
      const angle = start + span * t;

      const radius = SUN_RADIUS + 0.008 + Math.sin(t * Math.PI) * height;

      return new Vector3(
        radius * Math.sin(polar) * Math.cos(angle),
        radius * Math.cos(polar),
        radius * Math.sin(polar) * Math.sin(angle),
      );
    });

    return {
      geometry: new TubeGeometry(
        new CatmullRomCurve3(points),
        20,
        thickness,
        4,
        false,
      ),
      latitude,
      phase: random01(i, 6) * Math.PI * 2,
      color: new Color(i % 3 === 0 ? 0xffaf25 : 0xff4c0d),
    };
  });
}

function createHaloTexture(center: number, width: number) {
  const size = 128;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radial = Math.hypot(x - 63.5, y - 63.5) / 64;

      const intensity = Math.exp(-Math.pow((radial - center) / width, 2));

      const index = (y * size + x) * 4;

      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(intensity * 255);
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat);

  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}

type Props = {
  simulation?: SimulationStore;
  onReady?: () => void;
  animate?: boolean;
};

export function SolarPhoenix({ onReady, animate = true, simulation }: Props) {
  const gl = useThree((state) => state.gl);
  const resources = useContext(GpuResourceContext);
  const materialRef = useRef<ShaderMaterial>(null);

  const prominenceMeshes = useRef<(Mesh | null)[]>([]);

  const days = useRef(0);
  const granuleTime = useRef(0);
  const preparedFrames = useRef(0);
  const didNotifyReady = useRef(false);
  const allowMotion = useRef(true);
  const lastSeek = useRef(-1);

  const loops = useMemo(() => createProminences(), []);

  const innerHalo = useMemo(() => createHaloTexture(0.71, 0.12), []);

  const outerHalo = useMemo(() => createHaloTexture(0.48, 0.24), []);
  useEffect(() => {
    resources?.acquire(loops, gl, [innerHalo, outerHalo], {
      essential: true,
      pinned: true,
      label: "sun-halos",
    });
    return () => resources?.release(loops);
  }, [gl, innerHalo, outerHalo, loops, resources]);

  const uniforms = useMemo(
    () => ({
      uSolarDays: { value: 0 },
      uGranuleTime: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    days.current = (Date.now() - Date.UTC(2026, 0, 1)) / MS_PER_DAY;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sync = () => {
      allowMotion.current = !media.matches;
    };

    sync();

    media.addEventListener("change", sync);

    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    return () => {
      loops.forEach((loop) => {
        loop.geometry.dispose();
      });

      innerHalo.dispose();
      outerHalo.dispose();
    };
  }, [loops, innerHalo, outerHalo]);

  useFrame((_, delta) => {
    if (!didNotifyReady.current && ++preparedFrames.current >= 2) {
      didNotifyReady.current = true;
      onReady?.();
    }

    const frame = simulation?.getFrame();
    const seeking = frame && frame.seekId !== lastSeek.current;
    if ((!animate || !allowMotion.current) && !seeking) {
      return;
    }

    const solarSeconds = Math.min(delta, 0.05) * SIMULATION_SPEED;

    if (frame) {
      days.current = (frame.date.getTime() - Date.UTC(2026, 0, 1)) / MS_PER_DAY;
      granuleTime.current =
        ((days.current * SECONDS_PER_DAY) / (8 * 60)) % 10000;
      lastSeek.current = frame.seekId;
    } else {
      days.current += solarSeconds / SECONDS_PER_DAY;
      granuleTime.current += solarSeconds / (8 * 60);
    }

    if (materialRef.current) {
      materialRef.current.uniforms.uSolarDays.value = days.current;

      materialRef.current.uniforms.uGranuleTime.value = granuleTime.current;
    }

    prominenceMeshes.current.forEach((mesh, index) => {
      if (!mesh) return;

      const loop = loops[index];

      const period = 25 + 11 * Math.sin(loop.latitude) ** 2;

      mesh.rotation.y = (days.current % period) * ((Math.PI * 2) / period);

      const solarHours = (granuleTime.current * 8) / 60;

      (mesh.material as MeshBasicMaterial).opacity =
        0.49 + 0.08 * Math.sin(solarHours * 0.22 + loop.phase);
    });
  });

  return (
    <group rotation={[0, 0, SOLAR_AXIS_TILT]}>
      {/* Outer orange glow */}
      <sprite scale={[SUN_RADIUS * 4.2, SUN_RADIUS * 4.2, 1]} renderOrder={-2}>
        <spriteMaterial
          map={outerHalo}
          color="#ff6e15"
          opacity={0.58}
          transparent
          blending={AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>

      {/* Bright inner corona */}
      <sprite scale={[SUN_RADIUS * 2.8, SUN_RADIUS * 2.8, 1]} renderOrder={-1}>
        <spriteMaterial
          map={innerHalo}
          color="#ffab2d"
          opacity={0.94}
          transparent
          blending={AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>

      {/* Solar surface — no click flashes */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS, 96, 64]} />

        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={SUN_VERTEX}
          fragmentShader={SUN_FRAGMENT}
        />
      </mesh>

      {/* Stable magnetic prominence loops */}
      <group>
        {loops.map((loop, i) => (
          <mesh
            key={i}
            ref={(mesh) => {
              prominenceMeshes.current[i] = mesh;
            }}
            geometry={loop.geometry}
            renderOrder={2}
          >
            <meshBasicMaterial
              color={loop.color}
              transparent
              opacity={0.53}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      <pointLight intensity={4} decay={2} />
    </group>
  );
}
