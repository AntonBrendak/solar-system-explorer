"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  FrontSide,
  Vector2,
  Vector3,
  Vector4,
  type ShaderMaterial,
} from "three";

const DEBUG_WEATHER = true;

const SOL_MS = 88_775_244;
const EPOCH_MS = Date.UTC(2000, 0, 1, 12);

const MAX_STORMS = 4;
const LOOKBACK_SOLS = 23;

const DUST_MOTION_SPEED = DEBUG_WEATHER ? 100 : 1;

const LIGHTNING_WINDOW_MS = DEBUG_WEATHER ? 5_000 : 600_000;

const STORM_TYPES = [
  {
    kind: 1,
    probability: DEBUG_WEATHER ? 0 : 0.6,
    duration: [0.35, 1.2],
    radius: [0.1, 0.27],
    opacity: [0.42, 0.64],
    lightningChance: DEBUG_WEATHER ? 0 : 0.00012,
  },
  {
    kind: 2,
    probability: DEBUG_WEATHER ? 1 : 0.02,
    duration: [1.8, 5.0],
    radius: [0.36, 0.8],
    opacity: [0.63, 0.81],
    lightningChance: DEBUG_WEATHER ? 1 : 0.00055,
  },
  {
    kind: 3,
    probability: DEBUG_WEATHER ? 0 : 0.0006,
    duration: [10, 20],
    radius: [1.2, 2.3],
    opacity: [0.82, 0.96],
    lightningChance: DEBUG_WEATHER ? 0 : 0.0013,
  },
] as const;

type StormKind = (typeof STORM_TYPES)[number];

type StormEvent = {
  id: number;
  sol: number;
  kind: StormKind;
  start: number;
  end: number;
  center: Vector3;
  radius: number;
  opacity: number;
  drift: number;
};

type ActiveStorm = StormEvent & {
  direction: Vector3;
  strength: number;
};

function random01(sol: number, kind: number, index: number): number {
  let x =
    Math.imul(sol + 100_003, 0x9e3779b1) ^
    Math.imul(kind + 17, 0x85ebca77) ^
    Math.imul(index + 1, 0xc2b2ae3d);

  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;

  return (x >>> 0) / 0x1_0000_0000;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function generateStorms(currentSol: number): StormEvent[] {
  const events: StormEvent[] = [];

  for (let sol = currentSol - LOOKBACK_SOLS; sol <= currentSol; sol++) {
    for (const kind of STORM_TYPES) {
      if (random01(sol, kind.kind, 0) >= kind.probability) {
        continue;
      }

      const start =
        EPOCH_MS + sol * SOL_MS + random01(sol, kind.kind, 1) * SOL_MS;

      const duration = lerp(
        kind.duration[0],
        kind.duration[1],
        random01(sol, kind.kind, 2),
      );

      // Distribute storm centers uniformly across the sphere.
      const latitudeY = lerp(-0.94, 0.94, random01(sol, kind.kind, 3));

      const longitude = random01(sol, kind.kind, 4) * Math.PI * 2;

      const equatorial = Math.sqrt(1 - latitudeY * latitudeY);

      const center = new Vector3(
        equatorial * Math.cos(longitude),
        latitudeY,
        equatorial * Math.sin(longitude),
      );

      events.push({
        id: sol * 10 + kind.kind,
        sol,
        kind,
        start,
        end: start + duration * SOL_MS,
        center,

        radius: lerp(
          kind.radius[0],
          kind.radius[1],
          random01(sol, kind.kind, 5),
        ),

        opacity: lerp(
          kind.opacity[0],
          kind.opacity[1],
          random01(sol, kind.kind, 6),
        ),

        drift: lerp(-0.075, 0.075, random01(sol, kind.kind, 7)),
      });
    }
  }

  return events;
}

function getActiveStorms(events: StormEvent[], now: number): ActiveStorm[] {
  return events
    .filter((event) => now >= event.start && now < event.end)
    .map((event) => {
      const phase = (now - event.start) / (event.end - event.start);

      const fade = Math.max(0, Math.min(1, phase / 0.16, (1 - phase) / 0.24));

      const envelope = fade * fade * (3 - 2 * fade);

      const angle = (event.drift * (now - event.start)) / SOL_MS;

      const c = Math.cos(angle);
      const s = Math.sin(angle);

      return {
        ...event,

        direction: new Vector3(
          c * event.center.x + s * event.center.z,
          event.center.y,
          -s * event.center.x + c * event.center.z,
        ),

        strength: event.opacity * envelope,
      };
    })
    .filter((storm) => storm.strength > 0.001)
    .sort((a, b) => b.strength * b.radius - a.strength * a.radius)
    .slice(0, MAX_STORMS);
}

// VERTEX SHADER

const vertexShader = /* glsl */ `
  varying vec3 vLocalDirection;
  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  void main() {
    vLocalDirection = normalize(position);

    vWorldNormal = normalize(
      mat3(modelMatrix) * normal
    );

    vec4 viewPosition =
      modelViewMatrix * vec4(position, 1.0);

    vViewNormal = normalize(
      normalMatrix * normal
    );

    vViewDirection = normalize(
      -viewPosition.xyz
    );

    gl_Position =
      projectionMatrix * viewPosition;
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uSunDirection;

  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  void main() {
    vec3 n = normalize(vWorldNormal);

    float facing = clamp(
      dot(
        normalize(vViewNormal),
        normalize(vViewDirection)
      ),
      0.0,
      1.0
    );

    float rim = pow(
      1.0 - facing,
      3.2
    );

    float sunlight = smoothstep(
      -0.25,
      0.42,
      dot(n, normalize(uSunDirection))
    );

    vec3 darkHaze = vec3(
      0.40,
      0.29,
      0.27
    );

    vec3 sunlitHaze = vec3(
      0.93,
      0.68,
      0.50
    );

    vec3 color = mix(
      darkHaze,
      sunlitHaze,
      sunlight
    );

    float alpha =
      rim * (0.02 + 0.38 * sunlight);

    gl_FragColor = vec4(
      color,
      alpha
    );

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const dustFragmentShader = /* glsl */ `
  uniform vec3 uSunDirection;

  uniform vec4 uStorms[4];
  uniform vec4 uStormData[4];

  uniform vec2 uWind;

  uniform vec3 uFlashDirection;
  uniform float uFlash;

  varying vec3 vLocalDirection;
  varying vec3 vWorldNormal;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);

    p += dot(
      p,
      p.yzx + 33.33
    );

    return fract(
      (p.x + p.y) * p.z
    );
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    float a = mix(
      hash31(i),
      hash31(i + vec3(1., 0., 0.)),
      f.x
    );

    float b = mix(
      hash31(i + vec3(0., 1., 0.)),
      hash31(i + vec3(1., 1., 0.)),
      f.x
    );

    float c = mix(
      hash31(i + vec3(0., 0., 1.)),
      hash31(i + vec3(1., 0., 1.)),
      f.x
    );

    float d = mix(
      hash31(i + vec3(0., 1., 1.)),
      hash31(i + vec3(1., 1., 1.)),
      f.x
    );

    return mix(
      mix(a, b, f.y),
      mix(c, d, f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float a = noise3(p);
    float b = noise3(p * 2.07 + 9.4);

    return a * 0.72 + b * 0.28;
  }

  void main() {
    vec3 p = normalize(vLocalDirection);

    vec3 wind = vec3(
      uWind.x,
      uWind.y,
      uWind.x * 0.45
    );

    float largeNoise = fbm(
      p * 6.0 + wind
    );

    float fineNoise = noise3(
      p * 17.0 - wind * 0.8
    );

    float density = 0.0;

    for (int i = 0; i < 4; i++) {
      float strength = uStormData[i].x;

      if (strength <= 0.001) {
        continue;
      }

      vec3 center = normalize(
        uStorms[i].xyz
      );

      float radius = uStorms[i].w;
      float seed = uStormData[i].y;

      float turbulence =
        0.84 +
        0.24 * largeNoise +
        0.12 * fineNoise +
        0.08 * sin(
          seed * 6.28318 +
          largeNoise * 5.0
        );

      float dist =
        distance(p, center) /
        turbulence;

      float stormMask =
        1.0 - smoothstep(
          radius * 0.42,
          radius * 1.12,
          dist
        );

      float textureDetail = mix(
        0.72,
        1.0,
        largeNoise * 0.85 +
        fineNoise * 0.15
      );

      float regionDensity =
        stormMask *
        textureDetail *
        strength;

      // Allow overlapping storm contributions.
      density = 1.0 -
        (1.0 - density) *
        (1.0 - regionDensity);
    }

    density = clamp(
      density,
      0.0,
      1.0
    );

    float sunAngle = dot(
      normalize(vWorldNormal),
      normalize(uSunDirection)
    );

    float sunlight = smoothstep(
      -0.22,
      0.42,
      sunAngle
    );

    vec3 nightDust = vec3(
      0.19,
      0.10,
      0.09
    );

    vec3 dayDust = vec3(
      0.87,
      0.56,
      0.36
    );

    vec3 color = mix(
      nightDust,
      dayDust,
      sunlight
    );

    // Keep the dust partially transparent so surface detail remains visible.
    float alpha = clamp(
      density *
      mix(0.18, 0.94, sunlight),
      0.0,
      0.96
    );

    float flashSpot = pow(
      max(
        dot(
          p,
          normalize(uFlashDirection)
        ),
        0.0
      ),
      2500.0
    );

    float flash =
      flashSpot *
      uFlash *
      smoothstep(
        0.06,
        0.24,
        density
      );

    color +=
      vec3(1.1, 1.0, 0.82) *
      flash *
      0.08;

    alpha = clamp(
      alpha + flash * 0.025,
      0.0,
      0.99
    );

    gl_FragColor = vec4(
      color,
      alpha
    );

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// REACT COMPONENT

type MarsAtmosphereProps = {
  sunDirection: Vector3;
  active?: boolean;
};

export default function MarsAtmosphere({
  sunDirection,
  active = true,
}: MarsAtmosphereProps) {
  const dustMaterialRef = useRef<ShaderMaterial>(null);

  const cache = useRef<{
    sol: number;
    events: StormEvent[];
  } | null>(null);

  const recent = useRef<ActiveStorm[]>([]);
  const lastWeatherUpdate = useRef(0);

  const atmosphereUniforms = useMemo(
    () => ({
      uSunDirection: {
        value: sunDirection,
      },
    }),
    [sunDirection],
  );

  const dustUniforms = useMemo(
    () => ({
      uSunDirection: {
        value: sunDirection,
      },

      uStorms: {
        value: Array.from(
          { length: MAX_STORMS },
          () => new Vector4(0, 1, 0, 0),
        ),
      },

      uStormData: {
        value: Array.from({ length: MAX_STORMS }, () => new Vector4()),
      },

      uWind: {
        value: new Vector2(),
      },

      uFlash: {
        value: 0,
      },

      uFlashDirection: {
        value: new Vector3(0, 0, 1),
      },
    }),
    [sunDirection],
  );

  useFrame(() => {
    if (!active) return;

    // Update uniforms through the material ref instead of React state.
    const uniforms = dustMaterialRef.current?.uniforms;

    if (!uniforms) return;

    const now = Date.now();

    if (
      now - lastWeatherUpdate.current >= 1000 ||
      now < lastWeatherUpdate.current
    ) {
      lastWeatherUpdate.current = now;

      const sol = Math.floor((now - EPOCH_MS) / SOL_MS);

      if (!cache.current || cache.current.sol !== sol) {
        cache.current = {
          sol,
          events: generateStorms(sol),
        };
      }

      recent.current = getActiveStorms(cache.current.events, now);

      for (let i = 0; i < MAX_STORMS; i++) {
        const storm = recent.current[i];

        const center = uniforms.uStorms.value[i];

        const data = uniforms.uStormData.value[i];

        if (!storm) {
          center.set(0, 1, 0, 0);
          data.set(0, 0, 0, 0);
          continue;
        }

        // Convert angular radius to chord length for the shader.
        const chordRadius = 2 * Math.sin(storm.radius / 2);

        center.set(
          storm.direction.x,
          storm.direction.y,
          storm.direction.z,
          chordRadius,
        );

        data.set(storm.strength, random01(storm.sol, storm.kind.kind, 8), 0, 0);
      }
    }

    // Use absolute time so revisits preserve the simulated weather phase.
    const elapsedHours = (now - EPOCH_MS) / 3_600_000;

    const windTime = elapsedHours * DUST_MOTION_SPEED;

    uniforms.uWind.value.set(
      Math.sin(windTime * 0.8) * 1.4,
      Math.cos(windTime * 0.63) * 1.4,
    );

    uniforms.uFlash.value = 0;

    const slot = Math.floor(now / LIGHTNING_WINDOW_MS);

    let bestPulse = 0;
    let bestStorm: ActiveStorm | null = null;

    for (const storm of recent.current) {
      if (random01(slot, storm.id, 20) >= storm.kind.lightningChance) {
        continue;
      }

      const flashAt =
        slot * LIGHTNING_WINDOW_MS +
        random01(slot, storm.id, 21) * LIGHTNING_WINDOW_MS;

      const age = now - flashAt;

      if (age < 0 || age > 100) {
        continue;
      }

      const first = Math.exp(-Math.pow((age - 20) / 9, 2));

      const second = 0.25 * Math.exp(-Math.pow((age - 55) / 12, 2));

      const pulse = first + second;

      if (pulse > bestPulse) {
        bestPulse = pulse;
        bestStorm = storm;
      }
    }

    if (bestStorm) {
      uniforms.uFlash.value = Math.min(1, bestPulse);

      const vector = new Vector3(
        random01(slot, bestStorm.id, 22) * 2 - 1,
        random01(slot, bestStorm.id, 23) * 2 - 1,
        random01(slot, bestStorm.id, 24) * 2 - 1,
      ).normalize();

      const dot = vector.dot(bestStorm.direction);

      const tangent = vector
        .addScaledVector(bestStorm.direction, -dot)
        .normalize();

      const angle = bestStorm.radius * 0.25;

      uniforms.uFlashDirection.value
        .copy(bestStorm.direction)
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(tangent, Math.sin(angle))
        .normalize();
    }
  });

  return (
    <>
      <mesh renderOrder={1}>
        <sphereGeometry args={[2.023, 96, 64]} />

        <shaderMaterial
          ref={dustMaterialRef}
          uniforms={dustUniforms}
          vertexShader={vertexShader}
          fragmentShader={dustFragmentShader}
          transparent
          depthWrite={false}
          depthTest
          side={FrontSide}
        />
      </mesh>

      <mesh renderOrder={2}>
        <sphereGeometry args={[2.048, 96, 64]} />

        <shaderMaterial
          uniforms={atmosphereUniforms}
          vertexShader={vertexShader}
          fragmentShader={atmosphereFragmentShader}
          transparent
          depthWrite={false}
          depthTest
          side={FrontSide}
        />
      </mesh>
    </>
  );
}
