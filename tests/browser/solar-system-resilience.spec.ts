import { expect, test } from "@playwright/test";
import sharp from "sharp";
import type { GpuResourceBudget } from "@/shared/lib/gpu-resource-budget";

test("texture upgrades replace the visible model atomically within the combined resource budget", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "connection", {
      value: Object.assign(new EventTarget(), {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
      }),
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/solar-system?lang=en&diagnostics=1");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  const snapshot = () =>
    page.evaluate(() =>
      (
        window as Window & { __ORBITAL_MAP_RESOURCES__?: GpuResourceBudget }
      ).__ORBITAL_MAP_RESOURCES__!.snapshot(),
    );
  expect(
    (await snapshot()).renderers.map((renderer) => renderer.name).sort(),
  ).toEqual(["map", "previews"]);
  await page.locator('[data-map-navigation="mercury"]').click();
  await expect
    .poll(async () =>
      (await snapshot()).models.some(
        (model) => model.label?.includes("mercury:full:") && model.visible,
      ),
    )
    .toBe(true);
  await page.mouse.move(1050, 450);
  for (let step = 0; step < 10; step++) await page.mouse.wheel(0, -500);
  await expect
    .poll(
      async () =>
        (await snapshot()).models.some(
          (model) => model.label === "orbit:mercury:full:4k" && model.visible,
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  const result = await snapshot();
  expect(result.presentationFrames).toBeGreaterThan(100);
  expect(result.presentationIssues).toEqual([]);
  expect(result.estimatedBytes).toBeLessThanOrEqual(result.budgetBytes);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await snapshot()).models.some((model) =>
        model.label?.includes("mercury:full:"),
      ),
    )
    .toBe(false);
});

test("preview telemetry reports idle frames and unsupported GPU timing stays unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (
      this: WebGL2RenderingContext,
      name: string,
    ) {
      return name === "EXT_disjoint_timer_query_webgl2"
        ? null
        : Reflect.apply(original, this, [name]);
    } as typeof original;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/solar-system?lang=en");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page.locator('summary[aria-label="Performance"]').click();
  const main = page.locator('[data-renderer-metrics="map"]');
  const previews = page.locator('[data-renderer-metrics="previews"]');
  await expect(main.locator("dd").nth(3)).toHaveText("Unavailable");
  await expect(previews.locator("dd").first()).toHaveText("0");
  await expect(previews.locator("dd").nth(3)).toHaveText("Unavailable");
  await expect
    .poll(async () => Number(await main.locator("dd").first().textContent()))
    .toBeGreaterThan(0);
});

test("failed Full textures retain the prepared Lite planet", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "connection", {
      value: Object.assign(new EventTarget(), {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
      }),
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/solar-system?lang=en");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  // Lite has already cached 2K maps; fail the first genuinely new Full upgrade.
  await page.route("**/textures/runtime/mercury/*-4k.webp", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.locator('[data-map-navigation="mercury"]').click();
  await page.mouse.move(1050, 450);
  for (let step = 0; step < 10; step++) await page.mouse.wheel(0, -500);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "The detailed model could not load" }),
  ).toBeVisible();
  await expect(page.locator("canvas[data-map-canvas]")).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("free flight looks around with right-drag and keeps left-drag idle", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/solar-system?lang=en");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page.getByRole("button", { name: "Free flight", exact: true }).click();
  await page.waitForTimeout(1000);
  const canvas = page.locator("canvas[data-map-canvas]");
  const raw = async () =>
    sharp(await canvas.screenshot())
      .resize(360, 250)
      .raw()
      .toBuffer();
  const before = await raw();
  const difference = (a: Buffer, b: Buffer) =>
    a.reduce(
      (sum, value, index) => sum + Number(Math.abs(value - b[index]) > 15),
      0,
    ) / a.length;
  await page.mouse.move(700, 450);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(900, 470, { steps: 5 });
  await page.mouse.up({ button: "left" });
  expect(difference(before, await raw())).toBeLessThan(0.001);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(600, 380, { steps: 8 });
  await page.mouse.up({ button: "right" });
  expect(difference(before, await raw())).toBeGreaterThan(0.005);
  expect(
    await canvas.evaluate((element) => {
      const event = new MouseEvent("contextmenu", { cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
});

test("a failed planet gets local fallbacks while all previews finish and the map remains usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/textures/runtime/mercury/**", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/solar-system?lang=en");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.locator("main")).toHaveAttribute(
    "data-models-ready",
    "17/17",
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(
    page.locator(
      '[data-map-navigation="mercury"] [data-preview-state="fallback"]',
    ),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-map-navigation="earth"] [data-preview-state="ready"]'),
  ).toHaveCount(1);
  await page.locator('[data-map-navigation="earth"]').click();
  await expect(page.locator('[data-map-navigation="earth"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("startup still waits for pending planet previews", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/textures/runtime/mercury/**", async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto("/solar-system?lang=en");
    await expect(page.locator("main")).toHaveAttribute(
      "data-sun-ready",
      "true",
    );
    await expect(page.locator("main")).toHaveAttribute(
      "data-scene-ready",
      "false",
    );
    await expect(page.getByRole("progressbar")).toBeVisible();
  } finally {
    release();
  }
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.locator("main")).toHaveAttribute(
    "data-models-ready",
    "17/17",
  );
});

test("losing the preview WebGL context preserves map navigation", async ({
  page,
}) => {
  await page.goto("/solar-system?lang=en");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page.locator("canvas[data-preview-canvas]").evaluate((canvas) => {
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  });
  await expect(page.locator('[data-preview-state="fallback"]')).toHaveCount(9);
  await expect(page.locator("canvas[data-map-canvas]")).toBeVisible();
  await page.locator('[data-map-navigation="sun"]').click();
  await expect(page.locator('[data-map-navigation="sun"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("performance panel is collapsed by default, measures real frames and stays inside a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/solar-system?lang=en");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  const toggle = page.locator('summary[aria-label="Performance"]');
  const panel = toggle.locator("..");
  await expect(toggle).toBeVisible();
  await expect(panel).not.toHaveAttribute("open");
  await toggle.click();
  const mainMetrics = panel.locator('[data-renderer-metrics="map"]');
  const previewMetrics = panel.locator('[data-renderer-metrics="previews"]');
  await expect(mainMetrics.locator("dd")).toHaveCount(8);
  await expect(previewMetrics.locator("dd")).toHaveCount(8);
  await expect
    .poll(async () =>
      Number(await mainMetrics.locator("dd").first().textContent()),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      Number(
        (await mainMetrics.locator("dd").nth(4).textContent())?.replaceAll(
          ",",
          "",
        ),
      ),
    )
    .toBeGreaterThan(1);
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/solar-system-performance-mobile.png",
  });
  await toggle.click();
  await expect(panel).not.toHaveAttribute("open");
  await expect(mainMetrics.locator("dl")).toBeHidden();
});
