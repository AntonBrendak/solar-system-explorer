import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SkyRequestPolicy,
  SkyAssetError,
  SkyMainDecodePolicy,
} from "../widgets/solar-system/sky/streaming/SkyRequestPolicy.ts";
import { fetchSkyAsset } from "../widgets/solar-system/sky/streaming/sky-fetch.ts";
import { SkyWorkerClient } from "../widgets/solar-system/sky/streaming/SkyWorkerClient.ts";
import { mapLoadingProgress } from "../widgets/solar-system/model/loading-progress.ts";

test("models leave progress for actual Sky work instead of jumping to 94 percent", () => {
  const input = {
    models: 18,
    modelTotal: 18,
    sky: 0,
    skyTotal: 1000,
    ready: false,
  };
  assert.equal(mapLoadingProgress(input), 20);
  assert.equal(mapLoadingProgress({ ...input, sky: 500 }), 60);
  assert.equal(mapLoadingProgress({ ...input, sky: 1000 }), 99);
  assert.equal(mapLoadingProgress({ ...input, sky: 1000, ready: true }), 100);
  const samples = [0, 200, 400, 600, 800, 999].map((sky) =>
    mapLoadingProgress({ ...input, sky }),
  );
  assert.ok(samples.every((value, i) => i === 0 || value > samples[i - 1]));
});

test("transient failures back off and stop after four failures for an immutable tile", () => {
  const policy = new SkyRequestPolicy();
  const key = "64/1/2";
  for (let attempt = 0, now = 0; attempt < 4; attempt++) {
    assert.equal(policy.canRequest(key, now), true);
    policy.fail(key, new SkyAssetError("503", "transient"), now);
    const delay = 1000 * 2 ** attempt;
    assert.equal(policy.canRequest(key, now + delay - 1), false);
    now += delay;
    assert.equal(policy.canRequest(key, now), attempt < 3);
  }
  assert.equal(policy.canRequest(key, 1e12), false);
  assert.equal(policy.unavailable(key), true);
  assert.equal(policy.canRequest("64/1/3", 0), true);
});

test("integrity errors are terminal immediately and demand checks do not consume retries", () => {
  const policy = new SkyRequestPolicy();
  for (let view = 0; view < 100; view++)
    assert.equal(policy.canRequest("32/0/0", view), true);
  policy.fail(
    "32/0/0",
    new SkyAssetError("SHA-256 mismatch", "permanent"),
    100,
  );
  assert.equal(policy.canRequest("32/0/0", 1e12), false);
  const freshRevision = new SkyRequestPolicy();
  assert.equal(freshRevision.canRequest("32/0/0", 0), true);
});

test("retry-after extends the exponential backoff", () => {
  const policy = new SkyRequestPolicy();
  policy.fail("16/0/1", new SkyAssetError("429", "transient", 5000), 100);
  assert.equal(policy.canRequest("16/0/1", 5099), false);
  assert.equal(policy.canRequest("16/0/1", 5100), true);
});

test("two slow detail preparations latch streaming off; asynchronous waiting and base preparation do not count", () => {
  const policy = new SkyMainDecodePolicy();
  policy.record("base-4k", 1000);
  policy.record("64/0/0", 17);
  policy.record("64/0/1", 2);
  assert.equal(policy.disabled, false);
  policy.record("32/0/0", 17);
  assert.equal(policy.disabled, true);
  policy.record("16/0/0", 1);
  assert.equal(policy.disabled, true);
});

test("a valid-length corrupt response and a missing file produce permanent errors", async () => {
  const previous = globalThis.fetch;
  const asset = { bytes: 4, sha256: "0".repeat(64) };
  try {
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3, 4]));
    await assert.rejects(
      fetchSkyAsset(
        "https://sky.invalid/tile",
        asset,
        new AbortController().signal,
      ),
      (error) =>
        error.kind === "permanent" && error.message.includes("SHA-256"),
    );
    globalThis.fetch = async () => new Response("missing", { status: 404 });
    await assert.rejects(
      fetchSkyAsset(
        "https://sky.invalid/tile",
        asset,
        new AbortController().signal,
      ),
      (error) => error.kind === "permanent" && error.message.includes("404"),
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("worker RPC accepts out-of-order fetch responses and cancellation waits for acknowledgement", async () => {
  const previous = globalThis.Worker;
  const workers = [];
  globalThis.Worker = class {
    messages = [];
    constructor() {
      workers.push(this);
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {}
  };
  const client = new SkyWorkerClient();
  const worker = workers[0];
  try {
    const controller = new AbortController();
    const progress = [];
    const first = client.run({ type: "fetch" }, controller.signal, (loaded) =>
      progress.push(loaded),
    );
    const second = client.run({ type: "fetch" }, new AbortController().signal);
    const [a, b] = worker.messages;
    worker.onmessage({ data: { id: a.id, loaded: 128 } });
    worker.onmessage({ data: { id: a.id, loaded: 256 } });
    assert.deepEqual(progress, [128, 256]);
    worker.onmessage({ data: { id: b.id, result: "second" } });
    assert.equal(await second, "second");
    let settled = false;
    const observed = first.then(
      () => {
        settled = true;
      },
      (error) => {
        settled = true;
        return error;
      },
    );
    controller.abort();
    await Promise.resolve();
    assert.equal(settled, false);
    assert.deepEqual(worker.messages.at(-1), { type: "cancel", id: a.id });
    worker.onmessage({
      data: { id: a.id, error: "cancelled", kind: "cancelled" },
    });
    assert.equal((await observed).name, "AbortError");
  } finally {
    client.dispose();
    if (previous === undefined) delete globalThis.Worker;
    else globalThis.Worker = previous;
  }
});
