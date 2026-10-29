import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import {
  getTexturePolicy,
  getTextureBudget,
  nextTier,
  clampTier,
} from "../features/planet-viewer/model/texture-quality.ts";

const device = {
  memory: 8,
  cores: 8,
  saveData: false,
  effectiveType: "4g",
  downlink: 10,
  hidden: false,
  screenWidth: 390,
  viewWidth: 390,
  viewHeight: 320,
  dpr: 3,
  maxTextureSize: 16384,
};
test("quality always progresses to the highest supported source tier, including on small screens", () => {
  assert.equal(getTexturePolicy(device).base, "2k");
  assert.equal(getTexturePolicy(device).maximum, "8k");
  const slow = getTexturePolicy({ ...device, saveData: true, memory: 2 });
  assert.equal(slow.base, "1k");
  assert.equal(slow.maximum, "8k");
  assert.ok(slow.upgradeDelay > getTexturePolicy(device).upgradeDelay);
  assert.equal(
    getTexturePolicy({ ...device, maxTextureSize: 4096 }).maximum,
    "4k",
  );
  assert.equal(getTextureBudget(2), 96 * 1024 * 1024);
});
test("progressive upgrades visit each tier and clamp to actual source dimensions", () => {
  let tier = null;
  const seen = [];
  do {
    tier = nextTier(tier, "2k", "8k");
    seen.push(tier);
  } while (tier !== "8k");
  assert.deepEqual(seen, ["2k", "4k", "8k"]);
  assert.equal(clampTier("8k", "4k"), "4k");
  assert.equal(nextTier("8k", "2k", "4k"), "4k");
});
test("runtime maps preserve genuine 8K sources and fit Cloudflare asset limits", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL(
        "../features/planet-viewer/model/texture-manifest.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(manifest["/textures/mercury/mercuryMap.jpg"]["8k"].width, 8192);
  assert.equal(
    manifest["/textures/venus/venus-clouds-4k.jpg"]["8k"].width,
    4096,
  );
  for (const entry of Object.values(manifest))
    for (const asset of Object.values(entry)) {
      assert.ok(asset.url.startsWith("/textures/runtime/"));
      assert.equal(
        (await stat(new URL(`../public${asset.url}`, import.meta.url))).size,
        asset.bytes,
      );
      assert.ok(asset.bytes <= 25 * 1024 * 1024);
    }
  const baseBytes = Object.entries(manifest)
    .filter(([url]) => url.includes("/mercury/"))
    .reduce((sum, [, entry]) => sum + entry["2k"].bytes, 0);
  assert.ok(baseBytes < 5 * 1024 * 1024);
});
