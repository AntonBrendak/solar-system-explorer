import assert from "node:assert/strict";
import { test } from "node:test";
import { DataTexture, Group } from "three";
import { createModelPresentation } from "../features/planet-viewer/model/model-presentation.ts";

test("the draw fence presents one prepared layer across delayed Lite/Full and tier state updates", () => {
  const presentation = createModelPresentation(),
    renderer = {};
  const lite = new Group(),
    full = new Group(),
    pending = new Group();
  const liteState = {
    prepared: true,
    visible: true,
    fallback: true,
    priority: 0,
  };
  const fullState = {
    prepared: false,
    visible: true,
    fallback: false,
    priority: 11,
  };
  const pendingState = {
    prepared: false,
    visible: true,
    fallback: false,
    priority: 12,
  };
  presentation.register(renderer, "earth", lite, () => liteState);
  const removeFull = presentation.register(
    renderer,
    "earth",
    full,
    () => fullState,
  );
  const removePending = presentation.register(
    renderer,
    "earth",
    pending,
    () => pendingState,
  );
  const check = (frame, expected) => {
    presentation.flush(renderer, frame);
    assert.deepEqual(
      [lite, full, pending].filter((root) => root.visible),
      [expected],
    );
  };
  check(1, lite);
  fullState.prepared = true;
  check(2, full); // DOM has not hidden Lite yet.
  liteState.visible = false;
  check(3, full); // Pending GPU preparation must not blank the current model.
  pendingState.prepared = true;
  check(4, pending); // Old tier can still have a stale visible=true prop.
  removePending();
  removeFull();
  check(5, lite); // A failed/unmounted Full falls back before the DOM catches up.
});
import { createGpuResourceBudget } from "../shared/lib/gpu-resource-budget.ts";
import { createGpuFrameTimer } from "../shared/lib/gpu-frame-timer.ts";

const texture = () => new DataTexture(new Uint8Array(64), 4, 4);

test("an admitted streaming allowance survives base-profile updates and releases back to the combined baseline", () => {
  const budget = createGpuResourceBudget(128),
    sky = {};
  let updates = 0;
  const unsubscribe = budget.subscribeBudget(() => updates++);
  budget.setAllowance(sky, 1024);
  budget.setBudget(256);
  assert.equal(budget.getBudget(), 1024);
  assert.equal(updates, 1);
  budget.setAllowance(sky, 0);
  assert.equal(budget.getBudget(), 256);
  assert.equal(updates, 2);
  unsubscribe();
});

test("shared GPU accounting deduplicates owners per context and protects visible/pending models", () => {
  const budget = createGpuResourceBudget(128);
  const map = {},
    previews = {},
    active = {},
    cached = {},
    pending = {},
    other = {};
  const shared = texture(),
    unused = texture(),
    next = texture();
  let evicted = 0;
  budget.acquire(active, map, [shared], { pinned: true });
  budget.acquire(cached, previews, [unused], {
    evict: () => {
      unused.dispose();
      evicted++;
    },
  });
  assert.equal(budget.snapshot().estimatedBytes, 128);
  assert.equal(budget.acquire(pending, map, [next], { pinned: true }), true);
  assert.equal(evicted, 1);
  assert.equal(
    budget.acquire(other, map, [texture()], { pinned: true }),
    false,
  );
  assert.equal(budget.snapshot().estimatedBytes, 128);
  budget.release(pending);
  const alias = {};
  budget.acquire(alias, map, [shared], { pinned: true });
  assert.equal(budget.snapshot().estimatedBytes, 64);
  budget.acquire({}, previews, [shared], { pinned: true });
  assert.equal(budget.snapshot().estimatedBytes, 128);
  budget.release(active);
  assert.equal(budget.snapshot().estimatedBytes, 128);
  budget.release(alias);
  assert.equal(budget.snapshot().estimatedBytes, 64);
});

test("pressure evicts inactive LRU entries and keeps essential rendering above the limit", () => {
  const budget = createGpuResourceBudget(256);
  const renderer = {},
    a = {},
    b = {},
    essential = {};
  const order = [];
  budget.acquire(a, renderer, [texture()], { evict: () => order.push("a") });
  budget.acquire(b, renderer, [texture()], { evict: () => order.push("b") });
  budget.touch(a, true);
  budget.touch(a, false);
  budget.setBudget(64);
  assert.deepEqual(order, ["b"]);
  assert.equal(
    budget.acquire(essential, renderer, [texture()], {
      essential: true,
      pinned: true,
      extraBytes: 128,
    }),
    true,
  );
  assert.deepEqual(order, ["b", "a"]);
  assert.equal(budget.snapshot().estimatedBytes, 192);
  assert.equal(budget.acquire({}, renderer, [texture()]), false);
});

function timerContext(supported = true) {
  const state = {
    available: false,
    disjoint: false,
    running: false,
    starts: 0,
    deleted: 0,
    resultReads: 0,
  };
  const context = {
    CURRENT_QUERY: 1,
    QUERY_RESULT_AVAILABLE: 2,
    QUERY_RESULT: 3,
    getExtension: () =>
      supported ? { TIME_ELAPSED_EXT: 4, GPU_DISJOINT_EXT: 5 } : null,
    isContextLost: () => false,
    getQuery: () => (state.running ? {} : null),
    createQuery: () => ({}),
    beginQuery: () => {
      state.running = true;
      state.starts++;
    },
    endQuery: () => {
      state.running = false;
    },
    deleteQuery: () => {
      state.deleted++;
    },
    getParameter: () => state.disjoint,
    getQueryParameter: (_, parameter) => {
      if (parameter === 2) return state.available;
      state.resultReads++;
      return 2500000;
    },
  };
  return { state, timer: createGpuFrameTimer(context) };
}

test("GPU timing waits asynchronously, converts nanoseconds and discards disjoint queries", () => {
  const { state, timer } = timerContext();
  timer.begin();
  timer.end();
  timer.begin();
  assert.equal(state.starts, 1);
  assert.equal(timer.poll(), null);
  assert.equal(state.resultReads, 0);
  state.available = true;
  assert.equal(timer.poll(), 2.5);
  assert.equal(state.deleted, 1);
  timer.begin();
  timer.end();
  state.disjoint = true;
  assert.equal(timer.poll(), null);
  assert.equal(state.deleted, 2);
  timer.dispose();
  assert.equal(state.deleted, 2);
});

test("unsupported GPU timers stay unavailable and active queries are cleaned up", () => {
  const unsupported = timerContext(false);
  unsupported.timer.begin();
  unsupported.timer.end();
  assert.equal(unsupported.timer.poll(), null);
  assert.equal(unsupported.state.starts, 0);
  const supported = timerContext();
  supported.timer.begin();
  supported.timer.dispose();
  assert.equal(supported.state.running, false);
  assert.equal(supported.state.deleted, 1);
});
