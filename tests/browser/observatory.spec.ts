import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function selectLocale(page: Page, locale: "ru" | "en") {
  await page
    .getByRole("button", { name: /Язык интерфейса|Interface language/ })
    .click();
  await page
    .getByRole("option", { name: locale === "en" ? /English/ : /Русский/ })
    .click();
}

test("catalog, filters, locale, animated details and browser history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Реальные миры");
  await expect(page.locator("[data-card]")).toHaveCount(8);
  await page.getByRole("button", { name: "Газовые", exact: true }).click();
  await expect(page.locator("[data-card]")).toHaveCount(2);
  await page.getByRole("button", { name: "Все миры", exact: true }).click();
  const saturn = page.locator("[data-card=saturn]");
  await saturn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("Сатурн.");
  await dialog
    .getByRole("button", { name: "Характеристики", exact: true })
    .click();
  await expect(dialog.locator("dt")).toHaveCount(6);
  await dialog.getByRole("button", { name: "Следующая планета" }).click();
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("Уран.");
  await expect(
    dialog.getByText("Обратное вращение", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(saturn).toBeFocused();
  await expect(page.locator("[data-hero-planet]")).toHaveAttribute(
    "data-hero-planet",
    "uranus",
  );
  await selectLocale(page, "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toContainText("Real worlds");
  await page.locator("[data-card=neptune]").click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { level: 2 }),
  ).toHaveText("Neptune.");
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goForward();
  await expect(
    page.getByRole("dialog").getByRole("heading", { level: 2 }),
  ).toHaveText("Neptune.");
  expect(errors).toEqual([]);
});

test("full Mercury is the default, live position and a single renderer", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/?lang=en");
  const hero = page.locator("[data-hero-planet=mercury]");
  await expect(hero).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(hero.locator("[data-render-quality=full]")).toHaveCount(1, {
    timeout: 60000,
  });
  await expect(
    hero.locator("[data-live-position=mercury] time"),
  ).toHaveAttribute("datetime", /202\d-/);
  await page.screenshot({ path: "test-results/observatory-desktop.png" });
  await page.getByRole("button", { name: "Pause animations" }).click();
  const viewport = hero.locator("[data-planet-view=mercury]");
  const bounds = await viewport.boundingBox();
  if (!bounds) throw new Error("Mercury viewport is missing");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  const beforeDrag = await viewport.screenshot();
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 100,
    bounds.y + bounds.height / 2 + 25,
    { steps: 12 },
  );
  await page.mouse.up();
  const afterDrag = await viewport.screenshot();
  expect(beforeDrag.equals(afterDrag)).toBe(false);
  await page.getByRole("button", { name: "Resume animations" }).click();
  await hero.getByRole("button", { name: "Saturn", exact: true }).click();
  await expect(
    page.locator("[data-hero-planet=saturn] [data-render-quality=full]"),
  ).toHaveCount(1, { timeout: 45000 });
  await page
    .locator("canvas")
    .evaluate((element) =>
      element.setAttribute("data-context-session", "persistent"),
    );
  await page.locator("[data-card=saturn]").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("[data-render-ready=true]")).toHaveCount(1, {
    timeout: 45000,
  });
  await expect(dialog.locator("canvas")).toHaveCount(1);
  await expect(dialog.locator("canvas")).toHaveAttribute(
    "data-context-session",
    "persistent",
  );
  expect(
    await dialog.evaluate((element) =>
      (element as HTMLDialogElement).matches(":modal"),
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/observatory-saturn.png" });
  await page.getByRole("button", { name: "Close planet view" }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-context-session",
    "persistent",
  );
  await page
    .locator("#collection")
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(
    page.locator("[data-card=mercury] [data-render-ready=true]"),
  ).toHaveCount(1, { timeout: 45000 });
  await page.screenshot({ path: "test-results/observatory-gallery.png" });
});

test("mobile layout and accessible reduced-motion top-layer dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?lang=ru");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("[data-card=venus]").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("Венера.");
  await expect(dialog.locator("[data-render-ready=true]")).toHaveCount(1, {
    timeout: 45000,
  });
  await expect(
    dialog.getByRole("button", { name: /Язык интерфейса/ }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Приостановить анимации" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Следующая планета" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Приостановить анимации" }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Приостановить анимации" }).click();
  await expect(
    dialog.getByRole("button", { name: "Продолжить анимации" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "test-results/observatory-mobile-dialog.png" });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});

test("animated language list is main-page only and persists on reload", async ({
  page,
  request,
}) => {
  const response = await request.get("/?lang=en");
  expect(await response.text()).toContain('<html lang="en"');
  await page.goto("/?lang=ru");
  const trigger = page.getByRole("button", { name: "Язык интерфейса" });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option", { name: /Русский/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: /English/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.reload();
  await expect(page.locator("h1")).toContainText("Real worlds");
  await page.locator("[data-card=earth]").click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Interface language" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close planet view" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("full-screen overlay covers every responsive viewport", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?lang=en&planet=mercury");
  const dialog = page.getByRole("dialog");
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [768, 1024],
    [1440, 900],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.y).toBe(0);
    expect(box?.width).toBe(width);
    expect(box?.height).toBe(height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const close = dialog.getByRole("button", { name: "Close planet view" });
    expect(
      await close.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/observatory-ultrawide-dialog.png",
  });
});

test("all eight models can be explored without replacing the WebGL context", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/?lang=en&planet=mercury");
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
    await expect(
      page.getByRole("dialog").getByRole("heading", { level: 2 }),
    ).toHaveText(`${name}.`);
    await expect(
      page.getByRole("dialog").locator("[data-render-ready=true]"),
    ).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator("canvas")).toHaveCount(1);
    if (name !== "Neptune")
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Next planet" })
        .click();
  }
});

test("direct links and WebGL-unavailable fallback remain usable", async ({
  page,
}) => {
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
  await page.goto("/?lang=en&planet=mars");
  await expect(
    page.getByRole("dialog").getByRole("heading", { level: 2 }),
  ).toHaveText("Mars.");
  await expect(
    page.getByRole("dialog").locator("[data-detailed=true] img"),
  ).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Close planet view" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-card]")).toHaveCount(8);
});
