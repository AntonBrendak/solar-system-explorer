import { expect, test, type Page } from "@playwright/test";

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
  expect(
    await page
      .locator("[data-hero-planet=mercury] img")
      .evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("0");
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
