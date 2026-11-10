import {
  getPlanetScenePosition,
  getPlanetSceneState,
  SOLAR_SCALE,
  kmToSceneUnits,
  type PlanetScenePosition,
} from "../../../entities/planet/position.ts";
import { planetIds, type PlanetId } from "../../../entities/planet/types.ts";
import {
  getPlanetRotation,
  updatePlanetRotation,
  type PlanetRotation,
} from "../../../entities/planet/rotation.ts";
import { Quaternion, Vector3 } from "three";
import { updateCelestialRotation } from "../sky/celestial-frame.ts";

export const SIMULATION_LIMITS = {
  min: Date.UTC(1600, 0, 1),
  max: Date.UTC(2399, 11, 31, 23, 59, 59),
};
export const TIME_RATES = [
  -31_557_600, -2_592_000, -86_400, -3_600, -1, 1, 3_600, 86_400, 2_592_000,
  31_557_600,
] as const;

type Snapshot = {
  timestamp: number;
  rate: number;
  paused: boolean;
  realtime: boolean;
  ready: boolean;
};
const SERVER_SNAPSHOT: Snapshot = {
  timestamp: 0,
  rate: 1,
  paused: false,
  realtime: true,
  ready: false,
};

/** One ephemeris frame shared by every map consumer; React only observes the HUD at 10 Hz. */
export function createSimulationStore() {
  const date = new Date();
  const positions = Object.fromEntries(
    planetIds.map((id) => [id, getPlanetScenePosition(id, date)]),
  ) as Record<PlanetId, PlanetScenePosition>;
  const rotations = Object.fromEntries(
    planetIds.map((id) => [id, getPlanetRotation(id, date)]),
  ) as Record<PlanetId, PlanetRotation>;
  const skyRotation = updateCelestialRotation(date, new Quaternion());
  const frame = { date, positions, rotations, skyRotation, seekId: 0 };
  let timestamp = date.getTime();
  let calculated = timestamp;
  const samples = [0, 1].map(() => ({
    timestamp,
    skyRotation: skyRotation.clone(),
    positions: Object.fromEntries(
      planetIds.map((id) => [id, getPlanetSceneState(id, date)]),
    ) as Record<PlanetId, ReturnType<typeof getPlanetSceneState>>,
    rotations: Object.fromEntries(
      planetIds.map((id) => [id, getPlanetRotation(id, date)]),
    ) as typeof rotations,
  }));
  const sampleDate = new Date(timestamp);
  const spin = new Quaternion();
  const north = new Vector3(0, 1, 0);
  let samplesValid = false;
  let ephemerisCalculations = 0;
  let lastClock: number | null = null;
  let publishedAt = -Infinity;
  let rate = 1;
  let paused = false;
  let realtime = true;
  let snapshot: Snapshot = { timestamp, rate, paused, realtime, ready: true };
  const listeners = new Set<() => void>();

  const sample = (target: (typeof samples)[number], at: number) => {
    sampleDate.setTime(at);
    target.timestamp = at;
    updateCelestialRotation(sampleDate, target.skyRotation);
    for (const id of planetIds) {
      Object.assign(target.positions[id], getPlanetSceneState(id, sampleDate));
      updatePlanetRotation(id, sampleDate, target.rotations[id]);
    }
    ephemerisCalculations++;
  };
  const calculate = (force = false) => {
    if (!force && calculated === timestamp) return;
    date.setTime(timestamp);
    // One-second samples at real time, adapting up to 20 Hz at high rates.
    // Frame consumers keep stable references and interpolate without astronomy calls.
    const wallInterval = Math.max(
      50,
      1000 / Math.sqrt(Math.max(1, Math.abs(rate))),
    );
    const interval = Math.max(1000, Math.abs(rate) * wallInterval);
    const direction = rate < 0 && !realtime ? -1 : 1;
    const [a, b] = samples;
    if (
      force ||
      !samplesValid ||
      direction * (timestamp - a.timestamp) < 0 ||
      direction * (timestamp - b.timestamp) > interval
    ) {
      sample(a, timestamp);
      sample(
        b,
        Math.max(
          SIMULATION_LIMITS.min,
          Math.min(SIMULATION_LIMITS.max, timestamp + direction * interval),
        ),
      );
      samplesValid = true;
    } else if (direction * (timestamp - b.timestamp) > 0) {
      // Reuse the previous endpoint rather than calculating it twice.
      [samples[0], samples[1]] = [b, a];
      sample(
        a,
        Math.max(
          SIMULATION_LIMITS.min,
          Math.min(SIMULATION_LIMITS.max, b.timestamp + direction * interval),
        ),
      );
    }
    const from = samples[0],
      to = samples[1];
    const alpha =
      from.timestamp === to.timestamp
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              (timestamp - from.timestamp) / (to.timestamp - from.timestamp),
            ),
          );
    skyRotation.slerpQuaternions(from.skyRotation, to.skyRotation, alpha);
    const t2 = alpha * alpha,
      t3 = t2 * alpha;
    const h00 = 2 * t3 - 3 * t2 + 1,
      h10 = t3 - 2 * t2 + alpha;
    const h01 = -2 * t3 + 3 * t2,
      h11 = t3 - t2;
    const span = to.timestamp - from.timestamp;
    for (const id of planetIds) {
      const a = from.positions[id],
        b = to.positions[id],
        p = positions[id];
      p.x = h00 * a.x + h10 * span * a.vx + h01 * b.x + h11 * span * b.vx;
      p.y = h00 * a.y + h10 * span * a.vy + h01 * b.y + h11 * span * b.vy;
      p.z = h00 * a.z + h10 * span * a.vz + h01 * b.z + h11 * span * b.vz;
      p.distanceAu =
        Math.hypot(p.x, p.y, p.z) /
        kmToSceneUnits(SOLAR_SCALE.astronomicalUnitKm);
      const r = rotations[id],
        start = from.rotations[id],
        end = to.rotations[id];
      r.spin = start.spin + (end.spin - start.spin) * alpha;
      r.orientation.slerpQuaternions(start.orientation, end.orientation, alpha);
      r.north.lerpVectors(start.north, end.north, alpha).normalize();
      r.quaternion
        .copy(r.orientation)
        .multiply(spin.setFromAxisAngle(north, r.spin));
    }
    calculated = timestamp;
  };
  const publish = (clock: number, force = false) => {
    if (!force && clock - publishedAt < 100) return;
    publishedAt = clock;
    if (
      snapshot.timestamp === timestamp &&
      snapshot.rate === rate &&
      snapshot.paused === paused &&
      snapshot.realtime === realtime
    )
      return;
    snapshot = { timestamp, rate, paused, realtime, ready: true };
    listeners.forEach((listener) => listener());
  };
  const advance = (clock: number) => {
    const elapsed = lastClock === null ? 0 : Math.max(0, clock - lastClock);
    lastClock = clock;
    if (realtime) timestamp = Date.now();
    else if (!paused) timestamp += elapsed * rate;
    const bounded = Math.max(
      SIMULATION_LIMITS.min,
      Math.min(SIMULATION_LIMITS.max, timestamp),
    );
    if (bounded !== timestamp) {
      timestamp = bounded;
      paused = true;
      realtime = false;
    }
    calculate();
    publish(clock);
  };
  const change = (update: () => void) => {
    const clock = performance.now();
    advance(clock);
    update();
    samplesValid = false;
    calculate(true);
    publish(clock, true);
  };
  const seek = (value: number) => {
    if (!Number.isFinite(value)) return;
    timestamp = Math.max(
      SIMULATION_LIMITS.min,
      Math.min(SIMULATION_LIMITS.max, value),
    );
    realtime = false;
    paused = true;
    frame.seekId++;
  };

  return {
    getFrame: () => frame,
    getDiagnostics: () => ({ ephemerisCalculations }),
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    advance,
    togglePaused: () =>
      change(() => {
        realtime = false;
        paused = !paused;
      }),
    setRate: (value: number) => {
      if (!TIME_RATES.some((allowed) => allowed === value)) return;
      change(() => {
        rate = value;
        realtime = false;
        paused = false;
      });
    },
    seek: (value: number) => change(() => seek(value)),
    step: (milliseconds: number) =>
      change(() => seek(timestamp + milliseconds)),
    goLive: () =>
      change(() => {
        timestamp = Date.now();
        rate = 1;
        paused = false;
        realtime = true;
        frame.seekId++;
      }),
  };
}

export type SimulationStore = ReturnType<typeof createSimulationStore>;
