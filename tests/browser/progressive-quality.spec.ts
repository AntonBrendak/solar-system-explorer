import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

async function limitGpu(page: Page, size = 4096) {
  await page.addInitScript((limit) => {
    for (const Constructor of [
      window.WebGLRenderingContext,
      window.WebGL2RenderingContext,
    ]) {
      if (!Constructor) continue;
      const original = Constructor.prototype.getParameter;
      Constructor.prototype.getParameter = function (parameter: number) {
        return parameter === this.MAX_TEXTURE_SIZE
          ? limit
          : original.call(this, parameter);
      };
    }
  }, size);
}
async function settled(page: Page, planet: string, tier: string) {
  await expect(
    page.locator(
      `[data-hero-planet=${planet}] [data-render-quality=full][data-texture-tier="${tier}"][data-texture-state=settled]`,
    ),
  ).toHaveCount(1, { timeout: 60000 });
}

test("startup draws an interactive lightweight 3D model while Full textures load without requesting posters", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const posterRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/_next/image")
      posterRequests.push(request.url());
  });
  let releaseFull!: () => void;
  const fullPending = new Promise<void>((resolve) => {
    releaseFull = resolve;
  });
  await page.route("**/textures/runtime/mercury/**", async (route) => {
    await fullPending;
    await route.continue();
  });
  try {
    await page.goto("/?lang=en&diagnostics=1");
    const model = page.locator(
      "[data-hero-planet=mercury] [data-render-ready=true]",
    );
    await expect(model).toHaveAttribute("data-render-quality", "preview");
    await expect(model).toHaveAttribute("data-texture-state", "loading");
    await expect(page.locator("[data-planet-view] img")).toHaveCount(0);
    const stats = await page.evaluate(() =>
      window.__ORBITAL_RENDERER__!.snapshot(),
    );
    expect(stats.preparations["mercury:preview"]).toBe(1);
    expect(
      Object.keys(stats.preparations).some((id) => id.startsWith("mercury:full:")),
    ).toBe(false);

    // With animation paused, changing pixels after a drag proves the preview is 3D.
    const viewport = page.locator(
      "[data-hero-planet=mercury] [data-planet-view]",
    );
    const bounds = await viewport.boundingBox();
    if (!bounds) throw new Error("Preview viewport missing");
    const before = await sharp(await viewport.screenshot()).raw().toBuffer();
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 100,
      bounds.y + bounds.height / 2 + 25,
      { steps: 12 },
    );
    await page.mouse.up();
    const after = await sharp(await viewport.screenshot()).raw().toBuffer();
    expect(before.equals(after)).toBe(false);
    expect(posterRequests).toEqual([]);
  } finally {
    releaseFull();
  }
  await expect(
    page.locator("[data-hero-planet=mercury] [data-render-quality=full]"),
  ).toHaveCount(1, { timeout: 45000 });
  await expect(page.locator("[data-planet-view] img")).toHaveCount(0);
});

test("small screens receive the maximum supported detail through staged upgrades without a quality selector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await limitGpu(page);
  const textureRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/textures/"))
      textureRequests.push(request.url());
  });
  await page.goto("/?lang=en&diagnostics=1");
  await expect(
    page.locator("[data-hero-planet=mercury] [data-texture-tier='2k']"),
  ).toHaveCount(1, { timeout: 45000 });
  await settled(page, "mercury", "4k");
  expect(textureRequests.some((url) => url.includes("-8k."))).toBe(false);
  expect(textureRequests.some((url) => url.includes("mercuryMap.jpg"))).toBe(
    false,
  );
  expect(textureRequests.some((url) => url.includes("-2k.webp"))).toBe(true);
  expect(textureRequests.some((url) => url.includes("-4k.webp"))).toBe(true);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.locator("[data-hero-planet=mercury] img")).toHaveCount(0);
});

test("failed detail can be retried without leaving the interactive preview", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let requests = 0;
  const pattern = "**/textures/runtime/venus/clouds-2k.webp";
  await page.route(pattern, async (route) => {
    requests++;
    await route.fulfill({ status: 503, body: "temporary failure" });
  });
  await page.goto("/?lang=en&focus=venus&diagnostics=1");
  await expect(page.locator("[data-texture-state=failed]")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Retry loading 3D" }),
  ).toBeVisible();
  await page.unroute(pattern);
  await page.route(pattern, async (route) => {
    requests++;
    await route.continue();
  });
  await page.getByRole("button", { name: "Retry loading 3D" }).click();
  await settled(page, "venus", "4k");
  expect(requests).toBe(2);
  await expect(
    page.getByRole("button", { name: "Retry loading 3D" }),
  ).toHaveCount(0);
});

test("returning to a failed planet automatically retries its Full maps", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pattern = "**/textures/runtime/venus/clouds-2k.webp";
  await page.route(pattern, (route) =>
    route.fulfill({ status: 503, body: "temporary failure" }),
  );
  await page.goto("/?lang=en&focus=venus");
  await expect(page.locator("[data-texture-state=failed]")).toHaveCount(1);
  await page.unroute(pattern);
  await page
    .locator("[data-hero-planet]")
    .getByRole("button", { name: "Saturn", exact: true })
    .click();
  await settled(page, "saturn", "4k");
  await page
    .locator("[data-hero-planet]")
    .getByRole("button", { name: "Venus", exact: true })
    .click();
  await settled(page, "venus", "4k");
});

test("locale changes update metadata and published share assets remain available", async ({
  page,
  request,
}) => {
  await page.goto("/?lang=ru");
  await expect(page).toHaveTitle("ORBITAL — Интерактивная обсерватория");
  await page.getByRole("button", { name: "Язык интерфейса" }).click();
  await page.getByRole("option", { name: /English/ }).click();
  await expect(page).toHaveTitle("ORBITAL — Digital Observatory");
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
    "content",
    "en_US",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /\/og\/orbital-en\.png$/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/\?lang=en$/,
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /^Eight planets/,
  );
  for (const path of [
    "/og/orbital-en.png",
    "/og/orbital-ru.png",
    "/robots.txt",
    "/sitemap.xml",
  ])
    expect((await request.get(path)).status()).toBe(200);
});
