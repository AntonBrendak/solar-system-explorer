import assert from "node:assert/strict";
import { test } from "node:test";
import { Quaternion, Vector3 } from "three";
import { Ecliptic, MakeTime, Vector } from "astronomy-engine";
import {
  createSimulationStore,
  SIMULATION_LIMITS,
} from "../widgets/solar-system/simulation/simulation-store.ts";
import { getPlanetScenePosition } from "../entities/planet/position.ts";
import { getPlanetRotation } from "../entities/planet/rotation.ts";
import { updateCelestialRotation } from "../widgets/solar-system/sky/celestial-frame.ts";

test("simulation interpolates stable frame objects with fewer astronomy calculations and exact seeks", (context) => {
  context.mock.method(performance, "now", () => 0);
  const store = createSimulationStore();
  const start = Date.UTC(2026, 0, 1);
  store.seek(start);
  store.setRate(1);
  const frame = store.getFrame();
  const earth = frame.positions.earth;
  const rotation = frame.rotations.earth;
  const before = store.getDiagnostics().ephemerisCalculations;
  for (let i = 1; i <= 120; i++) store.advance((i * 1000) / 60);
  assert.equal(frame.positions.earth, earth);
  assert.equal(frame.rotations.earth, rotation);
  assert.ok(store.getDiagnostics().ephemerisCalculations - before <= 4);
  const exact = getPlanetScenePosition("earth", frame.date);
  assert.ok(
    Math.hypot(earth.x - exact.x, earth.y - exact.y, earth.z - exact.z) < 1e-6,
  );
  store.seek(Date.UTC(1900, 0, 1));
  const sought = getPlanetScenePosition("earth", frame.date);
  assert.ok(
    Math.hypot(earth.x - sought.x, earth.y - sought.y, earth.z - sought.z) <
      1e-9,
  );
  const paused = frame.date.getTime();
  store.advance(10000);
  assert.equal(frame.date.getTime(), paused);
});

test("reverse and accelerated playback preserve unwrapped rotation, enforce bounds and limit calculation frequency", (context) => {
  context.mock.method(performance, "now", () => 0);
  for (const rate of [-86400, 86400, 31557600]) {
    const store = createSimulationStore();
    store.seek(Date.UTC(2026, 0, 1));
    store.setRate(rate);
    const before = store.getDiagnostics().ephemerisCalculations;
    for (let i = 1; i <= 120; i++) store.advance((i * 1000) / 60);
    assert.ok(store.getDiagnostics().ephemerisCalculations - before < 60);
    for (const id of ["earth", "jupiter", "uranus"]) {
      const rotation = store.getFrame().rotations[id];
      const exact = getPlanetRotation(id, store.getFrame().date);
      assert.ok(
        rotation.quaternion.angleTo(exact.quaternion) < 0.002,
        `${id} at ${rate}`,
      );
    }
    const actual = store.getFrame().positions.mercury;
    const expected = getPlanetScenePosition("mercury", store.getFrame().date);
    assert.ok(
      Math.hypot(
        actual.x - expected.x,
        actual.y - expected.y,
        actual.z - expected.z,
      ) /
        Math.hypot(expected.x, expected.y, expected.z) <
        0.005,
    );
    store.seek(SIMULATION_LIMITS.max - 1);
    store.setRate(31557600);
    store.advance(10000);
    assert.equal(store.getFrame().date.getTime(), SIMULATION_LIMITS.max);
    assert.equal(store.getSnapshot().paused, true);
  }
});

test("NASA atlas axes and RA handedness agree with Astronomy Engine ecliptic-of-date vectors", () => {
  for (const year of [1600, 2000, 2026, 2399]) {
    const date = new Date(Date.UTC(year, 0, 1));
    const q = updateCelestialRotation(date, new Quaternion());
    for (const [x, y, z] of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]) {
      const expected = Ecliptic(new Vector(x, y, z, MakeTime(date))).vec;
      // The sphere's local axes are EQJ (x,z,y); the group reflects local Z.
      const actual = new Vector3(x, z, -y).applyQuaternion(q);
      assert.ok(
        actual.distanceTo(new Vector3(expected.x, expected.z, -expected.y)) <
          1e-12,
      );
    }
  }
});
