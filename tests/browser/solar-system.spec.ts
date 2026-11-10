import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const skyLock = JSON.parse(
  readFileSync(
    new URL(
      "../../widgets/solar-system/sky/model/sky-atlas.lock.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { root: string };

test("orbital light moves smoothly and stops with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/solar-system?lang=en");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  // The taller HUD shifts the projected orbits upward; sample their actual extent.
  const clip = { x: 400, y: 280, width: 600, height: 310 };
  const animated = await page.screenshot({ clip });
  await expect
    .poll(async () => animated.equals(await page.screenshot({ clip })))
    .toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Allow camera damping, opacity transitions and pending sky uploads to settle.
  await page.waitForTimeout(2000);
  await expect(page.locator("canvas[data-map-canvas]")).toHaveAttribute(
    "data-sky-streaming",
    "idle",
    { timeout: 45000 },
  );
  await page.waitForTimeout(600);
  const paused = await page.screenshot({ clip });
  await page.waitForTimeout(350);
  expect(paused.equals(await page.screenshot({ clip }))).toBe(true);
});

test("solar map loads, focuses bodies and returns to the overview", async ({
  page,
  request,
}) => {
  for (const path of [
    "/icon.svg",
    `${skyLock.root}/manifest.json`,
    `${skyLock.root}/reserve.webp`,
    `${skyLock.root}/tiles/16k/0/0.webp`,
    `${skyLock.root}/tiles/32k/0/0.webp`,
    `${skyLock.root}/tiles/64k/0/0.webp`,
  ]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/solar-system?lang=en");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);

  const sun = page.locator('[data-map-navigation="sun"]');
  const overview = page
    .getByRole("navigation")
    .getByRole("button", { name: "Overview", exact: true });
  // Inner planets can form a marker cluster; persistent navigation remains keyboard accessible.
  await sun.focus();
  await page.keyboard.press("Enter");
  await expect(sun).toHaveAttribute("aria-pressed", "true");
  await overview.click();
  await expect(overview).toHaveAttribute("aria-pressed", "true");

  const planet = page.locator('[data-map-navigation="mercury"]');
  await planet.click();
  await expect(planet).toHaveAttribute("aria-pressed", "true");
  await overview.click();
  await expect(page.locator("[data-selected=true]")).toHaveCount(0);
  const markers = await page
    .locator("[data-map-marker]:visible")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      }),
    );
  for (let i = 0; i < markers.length; i++)
    for (let j = i + 1; j < markers.length; j++) {
      const a = markers[i],
        b = markers[j];
      expect(
        a.right <= b.left ||
          b.right <= a.left ||
          a.bottom <= b.top ||
          b.bottom <= a.top,
      ).toBe(true);
    }
  await page.screenshot({ path: "test-results/solar-system-overview.png" });
  expect(errors).toEqual([]);
});

test("mobile solar map uses Russian labels and survives unavailable star tiles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/textures/space/revisions/v2/**/tiles/**", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/solar-system?lang=ru");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator("canvas[data-map-canvas]")).toBeVisible();
  await expect(page.locator("[data-sky-fallback]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator('[data-map-navigation="sun"]').click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Общий обзор", exact: true })
    .click();
  await expect(page.locator('[data-map-navigation="sun"]')).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator("main")).toHaveCSS("height", "390px");
});

test("solar map remains navigable without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return original.apply(this, [type, ...args] as Parameters<
        typeof original
      >);
    } as typeof original;
  });
  await page.goto("/solar-system?lang=ru");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Не удалось загрузить 3D-карту",
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page.getByRole("link", { name: "На главную" }).click();
  await expect(page).toHaveURL(/\/\?lang=ru$/);
});

test("solar map shows HTML coverage and home navigation when the reserve cannot load", async ({
  page,
}) => {
  await page.route("**/textures/space/revisions/v2/**/reserve.webp", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/solar-system?lang=en");
  await expect(page.locator('[data-sky-fallback="failed"]')).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/\?lang=en$/);
});
