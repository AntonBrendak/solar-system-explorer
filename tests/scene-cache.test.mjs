import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acquireScene,
  trimScenes,
  FULL_TEXTURE_BUDGET,
} from "../features/planet-viewer/model/scene-cache.ts";

const request = (planetId, owner = "hero") => ({ planetId, owner });
test("LRU retains the recent scene across unmount and transfers ownership to the dialog", () => {
  let slots = acquireScene([], request("saturn"));
  slots = slots.map((slot) => ({ ...slot, request: null }));
  slots = acquireScene(slots, request("uranus"));
  slots = acquireScene(slots, request("saturn", "dialog"));
  assert.deepEqual(
    slots.map((slot) => slot.planetId),
    ["uranus", "saturn"],
  );
  assert.equal(slots[1].request.owner, "dialog");
  slots = slots.map((slot) => ({ ...slot, request: null }));
  slots = acquireScene(slots, request("neptune"));
  assert.deepEqual(
    slots.map((slot) => slot.planetId),
    ["saturn", "neptune"],
  );
});
test("memory pressure evicts inactive scenes while pinning an oversized active model", () => {
  let slots = acquireScene([], request("saturn"));
  slots = slots.map((slot) => ({
    ...slot,
    bytes: FULL_TEXTURE_BUDGET,
    request: null,
  }));
  slots = acquireScene(slots, request("mercury"));
  slots = trimScenes(
    slots.map((slot) =>
      slot.planetId === "mercury"
        ? { ...slot, bytes: FULL_TEXTURE_BUDGET + 1 }
        : slot,
    ),
  );
  assert.deepEqual(
    slots.map((slot) => slot.planetId),
    ["mercury"],
  );
  assert.ok(slots[0].request);
});
