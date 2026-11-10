import { expect, test } from "@playwright/test";
import { build } from "vite";
import path from "node:path";

let probe: string;
test.beforeAll(async () => {
  const output = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      lib: {
        entry: path.resolve("tests/fixtures/sky-shader-probe.ts"),
        name: "SkyProbe",
        formats: ["iife"],
      },
    },
  });
  const bundle = Array.isArray(output) ? output[0] : output;
  if (!("output" in bundle)) throw new Error("Sky probe bundle missing");
  probe = bundle.output.find((item) => item.type === "chunk")!.code;
});

test("GPU sky sampling feathers only missing coverage, preserves internal page joins and blends into the retained parent", async ({
  page,
}) => {
  await page.goto("about:blank");
  await page.addScriptTag({ content: probe });
  const run = (parent: boolean, gradient = false) =>
    page.evaluate(
      (value) =>
        (
          window as unknown as {
            SkyProbe: {
              renderSkyProbe(
                parent: boolean,
                gradient: boolean,
              ): {
                row: number[];
                failures: string[];
                joinMaxError: number;
              };
            };
          }
        ).SkyProbe.renderSkyProbe(value.parent, value.gradient),
      { parent, gradient },
    );
  const adjacent = await run(false);
  expect(adjacent.failures).toEqual([]);
  const rgb = (row: number[], x: number) => row.slice(x * 4, x * 4 + 3);
  expect(rgb(adjacent.row, 0)[2]).toBeGreaterThan(245);
  expect(rgb(adjacent.row, 255)).toEqual([255, 0, 0]);
  expect(rgb(adjacent.row, 256)).toEqual([255, 0, 0]);
  const ramp = Array.from({ length: 32 }, (_, x) => adjacent.row[x * 4]);
  expect(
    Math.max(...ramp.slice(1).map((value, x) => Math.abs(value - ramp[x]))),
  ).toBeLessThan(35);
  const parent = await run(true);
  expect(parent.failures).toEqual([]);
  const edge = rgb(parent.row, 0);
  expect(edge[1]).toBeGreaterThan(245);
  expect(edge[2]).toBe(0);
  expect(rgb(parent.row, 256)).toEqual([255, 0, 0]);
  const physical = await run(false, true);
  expect(physical.failures).toEqual([]);
  expect(physical.joinMaxError).toBeLessThanOrEqual(1.1);
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
]) {
  test(`sky retains a real base and uploads detail at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/solar-system?lang=en&diagnostics=1");
    await expect(page.locator("main")).toHaveAttribute(
      "data-scene-ready",
      "true",
      { timeout: 60000 },
    );
    const canvas = page.locator("canvas[data-map-canvas]");
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-sky-base")), {
        timeout: 15000,
      })
      .toBeGreaterThanOrEqual(2048);
    await expect
      .poll(
        async () => Number(await canvas.getAttribute("data-sky-coverage")),
        {
          timeout: 45000,
        },
      )
      .toBeGreaterThanOrEqual(8);
    expect(
      Number(await canvas.getAttribute("data-postprocessing-bytes")),
    ).toBeLessThanOrEqual(192 * 1048576);
    await page.screenshot({ path: `test-results/sky-${viewport.width}.png` });
  });
}

test("visible coverage completes and a constrained device keeps the default allowance", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const requests = new Set<string>();
  page.on("request", (request) => {
    if (request.url().includes("/tiles/8k/")) requests.add(request.url());
  });
  await page.goto("/solar-system?lang=en&diagnostics=1");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 60000 },
  );
  const canvas = page.locator("canvas[data-map-canvas]");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-sky-coverage")), {
      timeout: 90000,
    })
    .toBeGreaterThanOrEqual(8);
  expect(Number(await canvas.getAttribute("data-sky-cap"))).toBe(256 * 1048576);
  expect(requests.size).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/sky-coverage-default.png" });
});

for (const allowance of [512, 1024]) {
  test(`a ${allowance} MiB allowance retains full 16K coverage and prepares local 64K before entry`, async ({
    page,
  }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
      Object.defineProperty(navigator, "connection", {
        value: Object.assign(new EventTarget(), {
          saveData: false,
          effectiveType: "4g",
          downlink: 10,
        }),
      });
    });
    await page.goto(
      `/solar-system?lang=en&diagnostics=1${allowance === 1024 ? "&skyMemory=1024" : ""}`,
    );
    await expect(page.locator("main")).toHaveAttribute(
      "data-scene-ready",
      "true",
      { timeout: 120000 },
    );
    const canvas = page.locator("canvas[data-map-canvas]");
    await expect(canvas).toHaveAttribute(
      "data-sky-cap",
      String(allowance * 1048576),
    );
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-sky-coverage")))
      .toBeGreaterThanOrEqual(16);
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-sky-aim")))
      .toBe(64);
    const resources = await page.evaluate(() =>
      (
        window as unknown as Window & {
          __ORBITAL_MAP_RESOURCES__: {
            snapshot(): { estimatedBytes: number; budgetBytes: number };
          };
        }
      ).__ORBITAL_MAP_RESOURCES__.snapshot(),
    );
    expect(resources.estimatedBytes).toBeLessThanOrEqual(resources.budgetBytes);
    if (allowance === 1024) {
      await page
        .getByRole("button", { name: "Free flight", exact: true })
        .click();
      await page.mouse.move(900, 400);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(1300, 550, { steps: 30 });
      await page.mouse.up({ button: "right" });
      // Observe a fresh diagnostic sample after camera damping and the one-second publisher.
      await page.waitForTimeout(1500);
      await expect
        .poll(
          async () => Number(await canvas.getAttribute("data-sky-coverage")),
          { timeout: 90000 },
        )
        .toBeGreaterThanOrEqual(16);
      await expect
        .poll(async () => Number(await canvas.getAttribute("data-sky-aim")), {
          timeout: 45000,
        })
        .toBe(64);
    }
  });
}

test("startup keeps the loader until the initial whole-view detail is published", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = 0;
  await page.route("**/tiles/8k/**", async (route) => {
    held++;
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/solar-system?lang=en&diagnostics=1");
    await expect.poll(() => held, { timeout: 30000 }).toBeGreaterThan(0);
    await expect(page.locator("main")).not.toHaveAttribute(
      "data-scene-ready",
      "true",
    );
    await expect(page.getByRole("progressbar")).toBeVisible();
  } finally {
    release();
  }
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 60000 },
  );
  const canvas = page.locator("canvas[data-map-canvas]");
  await expect
    .poll(async () => {
      const values = await canvas.evaluate((element) => ({
        ...element.dataset,
      }));
      return (
        Number(values.skyCoverage) >= Math.max(8, Number(values.skyTarget))
      );
    })
    .toBe(true);
});

test("a permanently missing initial tile finishes startup with the complete base", async ({
  page,
}) => {
  await page.route("**/tiles/8k/**", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/solar-system?lang=en&diagnostics=1");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  const canvas = page.locator("canvas[data-map-canvas]");
  await expect(canvas).toHaveAttribute("data-sky-target", "4");
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
});

test("context recovery retains the admitted allowance and rebuilds complete coverage", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/solar-system?lang=en&diagnostics=1&skyMemory=1024");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 120000 },
  );
  await page.locator("canvas[data-map-canvas]").evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext("webgl2")!;
    const extension = context.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("Context-loss extension unavailable");
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 1500);
  });
  await expect(page.locator('[data-sky-fallback="restoring"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expect(page.locator("[data-sky-fallback]")).toHaveCount(0, {
    timeout: 120000,
  });
  const canvas = page.locator("canvas[data-map-canvas]");
  await expect(canvas).toHaveAttribute("data-sky-cap", String(1024 * 1048576));
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-sky-coverage")))
    .toBeGreaterThanOrEqual(16);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-sky-aim")))
    .toBe(64);
});
