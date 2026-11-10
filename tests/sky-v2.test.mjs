import assert from "node:assert/strict";
import { test } from "node:test";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import {
  contains,
  transitionGroup,
  SkyLodSelector,
  describeGroup,
  appendGroupPages,
} from "../widgets/solar-system/sky/streaming/SkyLodSelector.ts";

test("expired shared frame deadlines defer both coverage planning and page construction", () => {
  const group = describeGroup({ level: 16, row: 1, column: 2 });
  const deadline = performance.now() - 1;
  const selector = new SkyLodSelector();
  const camera = new PerspectiveCamera(8, 1, 0.1, 1000);
  selector.update(camera, new Matrix4());
  assert.equal(appendGroupPages(group, 256, deadline), false);
  assert.equal(group.pages.length, 0);
  assert.equal(selector.plan(camera, 1000, 256, 512, deadline), null);
  assert.equal(appendGroupPages(group, 256, deadline), false);
  assert.equal(group.pages.length, 0);
  assert.equal(appendGroupPages(group, 256, Infinity), true);
  assert.equal(group.pages.length, 256);
  assert.ok(selector.plan(camera, 1000, 256, 512, Infinity));
});

test("angular transition coverage is invariant across physical GPU profiles", () => {
  const region = { level: 16, column: 7, row: 1 };
  let expected;
  for (const core of [1024, 512, 256]) {
    const group = transitionGroup(region, core);
    assert.equal(group.pages.length, 4 * (2048 / core) ** 2);
    assert.equal(
      new Set(group.pages.map((page) => page.id)).size,
      group.pages.length,
    );
    const regions = group.tiles.map(({ level, row, column }) => ({
      level,
      row,
      column,
    }));
    expected ??= regions;
    assert.deepEqual(regions, expected);
    assert.ok(group.tiles.every((tile) => contains(region, tile)));
    for (const tile of group.tiles) {
      const pages = group.pages.filter((page) => page.tile.id === tile.id);
      assert.equal(
        pages.reduce((sum) => sum + core * core, 0),
        2048 ** 2,
      );
      assert.ok(
        pages.every(
          (page) =>
            page.x >= 0 &&
            page.x < 2048 / core &&
            page.y >= 0 &&
            page.y < 2048 / core,
        ),
      );
    }
  }
});

test("a narrow off-axis projection selects atlas coverage and a wider view cannot demand more LOD on the same pool", () => {
  const camera = new PerspectiveCamera(8, 2, 0.1, 1000);
  camera.setViewOffset(2000, 1000, 1000, 0, 1000, 1000);
  const selector = new SkyLodSelector();
  selector.update(camera, new Matrix4());
  const narrow = selector.desiredLevel(camera, 1000, 1024, 48);
  let useful = 0;
  for (let row = 0; row < 16; row++)
    for (let column = 0; column < 32; column++) {
      if (selector.useful({ level: 64, row, column })) useful++;
    }
  assert.ok(useful > 0 && useful < 512);
  camera.clearViewOffset();
  camera.fov = 100;
  camera.updateProjectionMatrix();
  selector.update(camera, new Matrix4());
  assert.ok(selector.desiredLevel(camera, 1000, 1024, 48) <= narrow);
});

test("a visible tile cannot promote the coverage floor unless its whole angular transition group fits", () => {
  const camera = new PerspectiveCamera(1, 1, 0.1, 1000);
  const phi = (3.5 / 8) * Math.PI * 2;
  const theta = (1.5 / 4) * Math.PI;
  camera.lookAt(
    new Vector3(
      -Math.cos(phi) * Math.sin(theta),
      Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
    ),
  );
  const selector = new SkyLodSelector();
  selector.update(camera, new Matrix4());
  for (const core of [1024, 512, 256]) {
    const completeGroupPages = 4 * (2048 / core) ** 2;
    const plan = selector.plan(camera, 1000, core, completeGroupPages - 1);
    assert.equal(plan.coverage, 8);
    assert.equal(plan.refinement, 64);
  }
});
