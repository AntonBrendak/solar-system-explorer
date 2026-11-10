import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir, stat } from "node:fs/promises";
import {
  markerOpacity,
  clusterMapMarkers,
} from "../widgets/solar-system/markers/marker-layout.ts";
import { orbitOpacity } from "../widgets/solar-system/orbits/orbit-appearance.ts";

test("the pinned runtime sky revision is complete and fits the per-asset delivery limit", async () => {
  const lock = JSON.parse(
    await readFile(
      new URL(
        "../widgets/solar-system/sky/model/sky-atlas.lock.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const directory = new URL(`../public${lock.root}/`, import.meta.url);
  const entries = await readdir(directory, { recursive: true });
  const assets = entries.filter((entry) => entry.endsWith(".webp"));
  for (const name of [
    "reserve.webp",
    "base-2k.webp",
    "base-4k.webp",
    "base-8k.webp",
  ])
    assert.ok(assets.includes(name), name);
  assert.equal(assets.length, 676);
  for (const asset of assets) {
    const file = new URL(asset.replaceAll("\\", "/"), directory);
    assert.ok((await stat(file)).size <= 25 * 1024 * 1024, asset);
  }
});

test("actual marker clustering groups overlaps transitively, prioritizes selection and preserves input order", () => {
  const markers = [
    { id: "mercury", x: 200, y: 200, width: 90, height: 90, priority: 0 },
    { id: "venus", x: 240, y: 200, width: 90, height: 90, priority: 3 },
    { id: "sun", x: 400, y: 200, width: 100, height: 94, priority: 5 },
    { id: "earth", x: 440, y: 200, width: 90, height: 90, priority: 0 },
    { id: "mars", x: 20, y: 200, width: 90, height: 90, priority: 0 },
    { id: "neptune", x: 700, y: 200, width: 100, height: 90, priority: 0 },
  ];
  const selected = clusterMapMarkers(markers);
  assert.deepEqual(
    selected.map((group) => group.map((marker) => marker.id)),
    [["venus", "mercury"], ["sun", "earth"], ["mars"], ["neptune"]],
  );
  assert.deepEqual(
    markers.map((marker) => marker.id),
    ["mercury", "venus", "sun", "earth", "mars", "neptune"],
  );
});

test("marker clusters use split hysteresis and handle empty or connected chains", () => {
  const marker = (id, x) => ({
    id,
    x,
    y: 100,
    width: 40,
    height: 40,
    priority: 0,
  });
  assert.deepEqual(clusterMapMarkers([]), []);
  assert.equal(
    clusterMapMarkers([marker("a", 0), marker("b", 45), marker("c", 90)])
      .length,
    1,
  );
  const separated = [marker("a", 0), marker("b", 55)];
  assert.equal(clusterMapMarkers(separated).length, 2);
  assert.equal(clusterMapMarkers(separated, [["a", "b"]]).length, 1);
  assert.equal(
    clusterMapMarkers([marker("a", 0), marker("b", 65)], [["a", "b"]]).length,
    2,
  );
});

test("markers leave a close-up unobstructed and fade smoothly between overview and inspection", () => {
  assert.equal(markerOpacity(1), 1);
  assert.equal(markerOpacity(40), 0);
  assert.ok(markerOpacity(15) > markerOpacity(20));
  assert.ok(markerOpacity(20) > markerOpacity(25));
});

test("crowded and edge-on orbits fade while the active path remains available", () => {
  const overview = {
    elevation: 0.45,
    radiusPixels: 100,
    highlight: 0,
    dimmed: false,
  };
  const normal = orbitOpacity(overview);
  assert.ok(normal > 0.2);
  assert.ok(orbitOpacity({ ...overview, elevation: 0.01 }) < normal * 0.1);
  assert.ok(orbitOpacity({ ...overview, radiusPixels: 6 }) < normal * 0.1);
  assert.ok(orbitOpacity({ ...overview, dimmed: true }) < normal * 0.2);
  assert.ok(
    orbitOpacity({ ...overview, elevation: 0.01, highlight: 1 }) > 0.15,
  );
});
