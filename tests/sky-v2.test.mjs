import assert from "node:assert/strict";
import { test } from "node:test";
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from "three";
import {
  chooseBaseSize,
  MiB,
} from "../widgets/solar-system/sky/model/sky-config.ts";
import { coverageEdgeMask } from "../widgets/solar-system/sky/rendering/sky-coverage.ts";
import { viewportCoverageBudget } from "../widgets/solar-system/sky/streaming/ViewportCoverageBudget.ts";
import { skyResourcePolicy } from "../widgets/solar-system/sky/model/sky-resource-policy.ts";
import {
  contains,
  transitionGroup,
  SkyLodSelector,
  describeGroup,
  appendGroupPages,
} from "../widgets/solar-system/sky/streaming/SkyLodSelector.ts";

test("a usable main base survives insufficient detail-group headroom and respects hard limits", () => {
  const input = {
    maxTextureSize: 8192,
    ceiling: 8192,
    cpuBytes: 2 * MiB,
    gpuBytes: 2 * MiB,
    globalFree: 20 * MiB,
    streamingFree: 12 * MiB,
  };
  assert.equal(chooseBaseSize(input), 2048);
  assert.equal(chooseBaseSize({ ...input, streamingFree: 0 }), 2048);
  assert.equal(chooseBaseSize({ ...input, globalFree: 4 * MiB }), undefined);
  assert.equal(chooseBaseSize({ ...input, maxTextureSize: 1024 }), undefined);
  assert.equal(chooseBaseSize({ ...input, cpuBytes: 210 * MiB }), undefined);
  assert.equal(
    chooseBaseSize({
      ...input,
      globalFree: 200 * MiB,
      streamingFree: 200 * MiB,
    }),
    4096,
  );
});

test("coverage masks keep internal joins and longitude wrap solid, clamp poles and expose diagonal holes", () => {
  const data = new Float32Array(8 * 4 * 4).fill(1);
  assert.equal(coverageEdgeMask(data, 8, 0, 8, 0, 0), 0);
  data[(1 * 8 + 7) * 4] = 0;
  const mask = coverageEdgeMask(data, 8, 0, 8, 0, 0);
  assert.equal(mask, 1 << 6);
  assert.equal(coverageEdgeMask(data, 8, 0, 8, 4, 2), 0);
});

test("wide views retain partially visible cells and reserve 64K for justified screen density", () => {
  const camera = new PerspectiveCamera(90, 2, 0.1, 1000);
  camera.setViewOffset(2000, 1000, 1000, 0, 1000, 1000);
  const selector = new SkyLodSelector();
  selector.update(camera, new Matrix4());
  assert.equal(selector.plan(camera, 1080, 1024, 48).desiredLevel, 16);
  const cells = [];
  for (let row = 0; row < 16; row++)
    for (let column = 0; column < 32; column++) {
      const cell = { level: 64, row, column };
      if (selector.useful(cell, false)) cells.push(cell);
    }
  assert.ok(cells.length > 1 && cells.length < 512);
  const aimed = cells.filter((cell) => selector.aimed(cell));
  assert.equal(aimed.length, 1);
  assert.ok(cells.every((cell) => selector.useful(cell)));
  const frustum = new Frustum().setFromProjectionMatrix(
    camera.projectionMatrix,
  );
  assert.ok(
    cells.some((cell) => {
      const corners = [0, 1].flatMap((x) =>
        [0, 1].map((y) => {
          const phi = ((cell.column + x) / 32) * 2 * Math.PI;
          const theta = ((cell.row + y) / 16) * Math.PI;
          return frustum.containsPoint(
            new Vector3(
              -Math.cos(phi) * Math.sin(theta),
              Math.cos(theta),
              Math.sin(phi) * Math.sin(theta),
            ).multiplyScalar(10),
          );
        }),
      );
      return corners.some(Boolean) && !corners.every(Boolean);
    }),
  );
  assert.ok(
    cells
      .filter((cell) => !selector.aimed(cell))
      .every((cell) => selector.priority(cell) < selector.priority(aimed[0])),
  );
  camera.fov = 4;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  selector.update(camera, new Matrix4());
  assert.equal(selector.plan(camera, 1080, 1024, 200).refinement, 64);
});

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
  assert.equal(group.pages.length, 64);
  assert.ok(selector.plan(camera, 1000, 256, 512, Infinity));
});

test("angular transition coverage is invariant across physical GPU profiles", () => {
  const region = { level: 16, column: 7, row: 1 };
  let expected;
  for (const core of [1024, 512, 256]) {
    const group = transitionGroup(region, core);
    assert.equal(group.pages.length, (2048 / core) ** 2);
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
    const completeGroupPages = (2048 / core) ** 2;
    const plan = selector.plan(camera, 1000, core, completeGroupPages - 1);
    assert.equal(plan.coverage, 4);
    assert.equal(plan.refinement, 64);
  }
});

test("coverage plans reserve every visible ancestor and a complete next tile before raising the whole-view target", () => {
  const selector = new SkyLodSelector();
  const camera = new PerspectiveCamera(8, 2, 0.1, 1000);
  selector.update(camera, new Matrix4());
  let previous = 4;
  for (const slots of [8, 24, 48, 96, 200]) {
    const plan = selector.plan(camera, 1080, 1024, slots);
    assert.ok(plan.coverage >= previous);
    previous = plan.coverage;
    assert.equal(plan.requirements.length, 4);
    for (const requirement of plan.requirements)
      if (requirement.level <= plan.coverage)
        assert.ok(requirement.peakPages <= slots);
    assert.ok(plan.requirements.every((item) => item.peakPages > item.pages));
  }
});

test("viewport capacity scales with the visible working set and keeps transition pages outside the cache", () => {
  const selector = new SkyLodSelector();
  const camera = new PerspectiveCamera(48, 2, 0.1, 1000);
  selector.update(camera, new Matrix4());
  const wide = selector.plan(camera, 1080, 1024, 200);
  camera.fov = 4;
  camera.updateProjectionMatrix();
  selector.update(camera, new Matrix4());
  const narrow = selector.plan(camera, 1080, 1024, 200);
  assert.ok(narrow.budget.capacity < 200);
  assert.notEqual(narrow.budget.capacity, wide.budget.capacity);
  for (const plan of [wide, narrow]) {
    assert.equal(
      plan.budget.capacity,
      plan.budget.workingPages +
        plan.budget.cachePages +
        plan.budget.transitionPages,
    );
    assert.ok(plan.budget.transitionPages > 0);
    assert.ok(plan.budget.capacity <= 200);
  }
  const constrained = viewportCoverageBudget({
    requirements: wide.requirements,
    desiredLevel: 64,
    core: 1024,
    maxPages: 3,
  });
  assert.equal(constrained.coverage, 4);
  assert.equal(constrained.capacity, 0);
});

test("resource policy keeps weak/unknown devices at 256 MiB, admits 512 MiB and bounds explicit experiments", () => {
  const input = {
    memory: 8,
    cores: 8,
    saveData: false,
    maxTextureSize: 16384,
    maxArrayLayers: 2048,
  };
  assert.equal(skyResourcePolicy(input).capBytes, 512 * MiB);
  for (const change of [
    { memory: undefined },
    { memory: 4 },
    { cores: 4 },
    { saveData: true },
    { maxTextureSize: 4096 },
    { maxArrayLayers: 128 },
  ])
    assert.equal(
      skyResourcePolicy({ ...input, ...change }).capBytes,
      256 * MiB,
    );
  assert.equal(
    skyResourcePolicy({ ...input, experimentalMiB: 1024 }).capBytes,
    1024 * MiB,
  );
  assert.equal(
    skyResourcePolicy({ ...input, experimentalMiB: 99999 }).capBytes,
    512 * MiB,
  );
});
