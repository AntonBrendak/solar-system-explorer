import { expect, test } from "@playwright/test";

test("GSAP restores the logo, orbit particles, ambient background and buttons", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  const logo = page.locator("header [data-motion-logo-orbit=one]");
  const transform = () =>
    logo.evaluate((element) => getComputedStyle(element).transform);
  const initial = await transform();
  await expect.poll(transform).not.toBe(initial);
  const satellite = page.locator("header [data-motion-logo-satellite]");
  await expect
    .poll(() =>
      satellite.evaluate((element) =>
        parseFloat(getComputedStyle(element).offsetDistance),
      ),
    )
    .toBeGreaterThan(0);
  const traveler = page.locator('[data-motion-orbit-traveler="one"]');
  await expect
    .poll(() =>
      traveler.evaluate((element) =>
        parseFloat(getComputedStyle(element).offsetDistance),
      ),
    )
    .toBeGreaterThan(0);
  const nebula = page.locator('[data-motion-nebula="one"]');
  await expect
    .poll(() =>
      nebula.evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe("none");
  await expect(page.locator("[data-motion-star]")).toHaveCount(96);

  const button = page.locator('[data-motion-button="primary"]');
  await button.hover();
  await expect
    .poll(() =>
      button.evaluate((element) =>
        parseFloat(getComputedStyle(element).getPropertyValue("--motion-y")),
      ),
    )
    .toBeLessThan(-2);
  await expect
    .poll(() =>
      button
        .locator("[data-motion-button-sheen]")
        .evaluate((element) => element.getAttribute("style") ?? ""),
    )
    .toContain("translate");

  await page.getByRole("button", { name: "Pause animations" }).click();
  await expect(
    page.getByRole("button", { name: "Resume animations" }),
  ).toBeVisible();
  const paused = await transform();
  // A bounded real interval verifies the animation freezes, not just its label.
  await page.waitForTimeout(250);
  expect(await transform()).toBe(paused);
  await page.getByRole("button", { name: "Resume animations" }).click();
  await expect.poll(transform).not.toBe(paused);
});

test("GSAP decorations respect live changes to reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?lang=en");
  const logo = page.locator("header [data-motion-logo-orbit=one]");
  const transform = () =>
    logo.evaluate((element) => getComputedStyle(element).transform);
  const staticTransform = await transform();
  await page.waitForTimeout(200);
  expect(await transform()).toBe(staticTransform);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(transform).not.toBe(staticTransform);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(transform).toBe(staticTransform);
  const button = page.locator('[data-motion-button="primary"]');
  await button.hover();
  expect(
    await button.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--motion-y"),
    ),
  ).toBe("");
});
