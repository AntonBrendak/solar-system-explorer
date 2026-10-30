import { expect, test } from "@playwright/test";

test("the system-map action opens a separate starfield route and returns to the observatory", async ({ page }) => {
  await page.goto("/?lang=en");
  const link = page.getByRole("link", { name: "Solar System 3D" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/solar-system\?lang=en$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("THE SOLAR SYSTEM.");
  await expect(page.locator("[data-starfield] canvas")).toHaveCount(1);
  await page.getByRole("link", { name: "Back to observatory" }).click();
  await expect(page).toHaveURL(/\/\?lang=en$/);
  await expect(page.locator("[data-hero-planet=mercury]")).toBeVisible();
});

test("system map preserves Russian and fits narrow mobile screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=ru");
  const link = page.getByRole("link", { name: "Солнечная система 3D" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("СОЛНЕЧНАЯ СИСТЕМА");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByRole("link", { name: "Назад в обсерваторию" })).toBeVisible();
});
