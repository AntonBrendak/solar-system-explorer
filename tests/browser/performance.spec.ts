import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { RenderDiagnostics } from "../../features/planet-viewer/ui/RendererDiagnostics";

async function snapshot(page: Page): Promise<RenderDiagnostics> {
  return page.evaluate(() => {
    if (!window.__ORBITAL_RENDERER__)
      throw new Error("Renderer diagnostics unavailable");
    return window.__ORBITAL_RENDERER__.snapshot();
  });
}
function fullPreparations(stats: RenderDiagnostics, planet: string) {
  return Object.fromEntries(Object.entries(stats.preparations).filter(([name]) => name.startsWith(`${planet}:full:`)));
}

async function full(page: Page, planet: string) {
  await expect(
    page.locator(`[data-hero-planet=${planet}] [data-render-quality=full]`),
  ).toHaveCount(1, { timeout: 60000 });
  await expect(
    page.locator(`[data-hero-planet=${planet}] [data-texture-state=settled]`),
  ).toHaveCount(1, { timeout: 90000 });
}

async function expectModelInsideViewport(page: Page) {
  const bounds = await page
    .locator("[data-hero-planet] [data-detailed=true]")
    .boundingBox();
  if (!bounds) throw new Error("Detailed viewport missing");
  const visible = await page.screenshot();
  await page.locator("canvas").evaluate((element) => {
    element.style.visibility = "hidden";
  });
  const hidden = await page.screenshot();
  await page.locator("canvas").evaluate((element) => {
    element.style.visibility = "";
  });
  const a = await sharp(visible)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const b = await sharp(hidden).ensureAlpha().raw().toBuffer();
  let changed = 0,
    inside = 0;
  for (let y = 0; y < a.info.height; y++)
    for (let x = 0; x < a.info.width; x++) {
      const offset = (y * a.info.width + x) * 4;
      if (
        Math.max(
          ...[0, 1, 2].map((channel) =>
            Math.abs(a.data[offset + channel] - b[offset + channel]),
          ),
        ) <= 20
      )
        continue;
      changed++;
      if (
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      )
        inside++;
    }
  expect(changed).toBeGreaterThan(1000);
  expect(inside / changed).toBeGreaterThan(0.95);
  const stats = await snapshot(page);
  expect(stats.canvasSize).toEqual({
    width: 1440,
    height: 1000,
    top: 0,
    left: 0,
  });
}

test("Full scenes reuse prepared GPU resources and evict within the cache budget", async ({
  page,
}, testInfo) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?lang=en&focus=saturn&diagnostics=1");
  await full(page, "saturn");
  await expectModelInsideViewport(page);
  await page
    .locator("[data-hero-planet] button")
    .getByText("Uranus", { exact: true })
    .click();
  await full(page, "uranus");
  const before = await snapshot(page);
  await page
    .locator("[data-hero-planet] button")
    .getByText("Saturn", { exact: true })
    .click();
  await full(page, "saturn");
  const reused = await snapshot(page);
  expect(fullPreparations(reused, "saturn")).toEqual(fullPreparations(before, "saturn"));
  expect(reused.textures).toBe(before.textures);
  expect(reused.activations.at(-1)?.fullMs).toBeLessThan(5000);
  await page
    .locator("[data-hero-planet]")
    .getByRole("button", { name: "Look closer" })
    .click();
  await expect(
    page.getByRole("dialog").locator("[data-render-quality=full]"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Close planet view" }).click();
  await full(page, "saturn");
  expect(fullPreparations(await snapshot(page), "saturn")).toEqual(fullPreparations(before, "saturn"));
  await page.locator("#collection").scrollIntoViewIfNeeded();
  await expect
    .poll(async () =>
      (await snapshot(page)).fullScenes.every((slot) => !slot.active),
    )
    .toBe(true);
  await page.locator("h1").scrollIntoViewIfNeeded();
  await full(page, "saturn");
  expect(fullPreparations(await snapshot(page), "saturn")).toEqual(fullPreparations(before, "saturn"));

  const samples = [before, reused];
  // Wait for the final supported texture tier, not only the lightweight first frame: traverse all eight models twice.
  for (let round = 0; round < 2; round++) {
    for (const name of [
      "Mercury",
      "Venus",
      "Earth",
      "Mars",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
    ]) {
      await page
        .locator("[data-hero-planet]")
        .getByRole("button", { name, exact: true })
        .click();
      await full(page, name.toLowerCase());
      if (round === 0 && name === "Mercury") {
        const tier = await page.locator("[data-hero-planet=mercury] [data-texture-tier]").getAttribute("data-texture-tier");
        const preparationKey = `mercury:full:${tier}`;
        const prepared = (await snapshot(page)).preparations[preparationKey];
        await page
          .locator("[data-hero-planet]")
          .getByRole("button", { name: "Look closer" })
          .click();
        await expect(
          page.getByRole("dialog").locator("[data-render-quality=full]"),
        ).toHaveCount(1);
        await page.getByRole("button", { name: "Close planet view" }).click();
        await full(page, "mercury");
        expect((await snapshot(page)).preparations[preparationKey]).toBe(
          prepared,
        );
        // The active 512 MiB model may exceed the budget; an inactive one may not.
        await page.locator("#collection").scrollIntoViewIfNeeded();
        await expect
          .poll(async () => (await snapshot(page)).fullScenes.length)
          .toBe(0);
        await page.locator("h1").scrollIntoViewIfNeeded();
        await full(page, "mercury");
        expect((await snapshot(page)).preparations[preparationKey]).toBe(
          prepared + 1,
        );
      }
      const stats = await snapshot(page);
      expect(stats.fullScenes.length).toBeLessThanOrEqual(stats.fullSceneLimit);
      const activeBytes = stats.fullScenes
        .filter((slot) => slot.active)
        .reduce((sum, slot) => sum + slot.estimatedTextureBytes, 0);
      const allBytes = stats.fullScenes.reduce(
        (sum, slot) => sum + slot.estimatedTextureBytes,
        0,
      );
      expect(allBytes).toBeLessThanOrEqual(
        Math.max(stats.textureBudget, activeBytes),
      );
      // Evicted maps must leave GPU memory, even if decoded loader images remain cached.
      await expect
        .poll(async () => {
          const resident = await snapshot(page);
          return resident.textures - resident.residentTextureCount;
        })
        .toBeLessThanOrEqual(2);
      samples.push(await snapshot(page));
    }
  }
  const firstCycle = samples[9];
  const secondCycle = samples.at(-1)!;
  // Driver allocations must settle instead of accumulating once per visit.
  await expect
    .poll(async () => (await snapshot(page)).textures)
    .toBeLessThanOrEqual(firstCycle.textures + 2);
  expect(secondCycle.geometries).toBeLessThanOrEqual(firstCycle.geometries + 2);
  expect(secondCycle.activations.every((entry) => entry.fullMs < 60000)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  const report = testInfo.outputPath("renderer-resource-samples.json");
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(report, JSON.stringify(samples, null, 2));
  await testInfo.attach("renderer-resource-samples", {
    path: report,
    contentType: "application/json",
  });
});

test("RU and EN glyphs use the bundled Inter and Manrope fonts", async ({
  page,
}) => {
  await page.goto("/?lang=ru");
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  for (const locale of ["ru", "en"]) {
    if (locale === "en") {
      await page.getByRole("button", { name: "Язык интерфейса" }).click();
      await page.getByRole("option", { name: /English/ }).click();
    }
    for (const family of ["Inter", "Manrope"]) {
      const selector = family === "Inter" ? "#hero-title + p" : "#hero-title";
      await page.evaluate(async (selector) => {
        const element = document.querySelector(selector)!;
        const style = getComputedStyle(element);
        await document.fonts.load(
          `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          element.textContent ?? "",
        );
        await document.fonts.ready;
      }, selector);
      const { root } = await session.send("DOM.getDocument");
      const { nodeId } = await session.send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector,
      });
      const { fonts } = await session.send("CSS.getPlatformFontsForNode", {
        nodeId,
      });
      expect(fonts.length).toBeGreaterThan(0);
      expect(
        fonts.every(
          (font) =>
            font.isCustomFont &&
            font.familyName.includes(family) &&
            font.glyphCount > 0,
        ),
      ).toBe(true);
    }
  }
  await session.detach();
});
