import assert from "node:assert/strict";
import { test } from "node:test";
import { getCyclones } from "../features/weather/server/cyclones.ts";
import { getEumetsatLightning } from "../features/weather/server/lightning-eumetsat.ts";
import { getPrecipitation } from "../features/weather/server/precipitation.ts";
import { getPrecipitationMask } from "../features/weather/server/precipitation-mask.ts";
import { encode, decode } from "fast-png";

test("weather services return a quiet, recoverable response when upstream data is unavailable", async (context) => {
  const logs = context.mock.method(console, "error", () => {});
  const warnings = context.mock.method(console, "warn", () => {});
  context.mock.method(
    globalThis,
    "fetch",
    async () => new Response("Unavailable", { status: 503 }),
  );
  for (const handler of [
    getCyclones,
    getEumetsatLightning,
    getPrecipitation,
    getPrecipitationMask,
  ]) {
    const response = await handler();
    assert.equal(response.status, 502);
    assert.ok(await response.text());
  }
  assert.equal(logs.mock.callCount(), 0);
  assert.equal(warnings.mock.callCount(), 0);
});

test("precipitation processing preserves transparency and rainfall ordering without native modules", async (context) => {
  const colors = Array.from({ length: 20 }, (_, index) => [
    index * 10,
    index * 5,
    index * 3,
    index ? 255 : 0,
  ]);
  const xml = colors
    .map(
      ([r, g, b], index) =>
        `<ColorMapEntry rgb="${r},${g},${b}" value="[${index + 1},${index + 2})"/>`,
    )
    .join("");
  const image = encode({
    width: 2,
    height: 2,
    channels: 4,
    data: new Uint8Array([
      ...colors[0],
      ...colors[1],
      ...colors[19],
      ...colors[10],
    ]),
  });
  context.mock.method(globalThis, "fetch", async (input) =>
    String(input).endsWith(".xml")
      ? new Response(xml)
      : new Response(image, { headers: { "Content-Type": "image/png" } }),
  );
  const response = await getPrecipitationMask();
  assert.equal(response.status, 200);
  const mask = decode(new Uint8Array(await response.arrayBuffer()));
  assert.equal(mask.channels, 1);
  assert.equal(mask.data[0], 0);
  assert.ok(
    mask.data[1] > 0 &&
      mask.data[1] < mask.data[3] &&
      mask.data[3] < mask.data[2],
  );
});
