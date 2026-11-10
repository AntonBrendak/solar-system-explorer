import { expect, test } from "@playwright/test";

test.use({
  video: "retain-on-failure",
  viewport: { width: 1920, height: 1080 },
});

test("smooth sky survives a full 360-degree turn, reversal and polar views", async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  await page.goto("/solar-system?lang=en&diagnostics=1&skyMemory=1024");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 120000 },
  );
  await page.getByRole("button", { name: "Free flight", exact: true }).click();
  const canvas = page.locator("canvas[data-map-canvas]");
  await page.waitForTimeout(500);
  // Feed the same window-pointer path as free flight. 0.0025 radians per pixel:
  // unlike a clipped physical cursor, this permits a complete uninterrupted turn.
  await canvas.evaluate((element) => {
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 7,
        pointerType: "mouse",
        button: 2,
        buttons: 2,
        clientX: 800,
        clientY: 300,
        bubbles: true,
      }),
    );
  });
  for (let sector = 0; sector < 4; sector++) {
    await page.evaluate(async (sector) => {
      for (let frame = 1; frame <= 45; frame++) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const angle = ((sector + frame / 45) * Math.PI) / 2;
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerId: 7,
            pointerType: "mouse",
            buttons: 2,
            clientX: 800 + angle / 0.0025,
            clientY: 300,
            bubbles: true,
          }),
        );
      }
    }, sector);
    await expect(page.locator("[data-sky-fallback]")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`rotation-${sector + 1}.png`),
    });
  }
  await page.evaluate(async () => {
    for (let frame = 1; frame <= 60; frame++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 7,
          pointerType: "mouse",
          buttons: 2,
          clientX: 800 + (2 * Math.PI - (frame / 60) * Math.PI) / 0.0025,
          clientY: 300,
          bubbles: true,
        }),
      );
    }
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 7,
        pointerType: "mouse",
        button: 2,
        buttons: 0,
        bubbles: true,
      }),
    );
  });
  for (const [name, dy] of [
    ["north", -1600],
    ["south", 1600],
  ] as const) {
    await canvas.evaluate((element, dy) => {
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 8,
          pointerType: "mouse",
          button: 2,
          buttons: 2,
          clientX: 800,
          clientY: 300,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 8,
          pointerType: "mouse",
          buttons: 2,
          clientX: 800,
          clientY: 300 + dy,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 8,
          pointerType: "mouse",
          button: 2,
          bubbles: true,
        }),
      );
    }, dy);
    await page.waitForTimeout(1200);
    await expect(page.locator("[data-sky-fallback]")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  }
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-sky-coverage")), {
      timeout: 45000,
    })
    .toBeGreaterThanOrEqual(16);
  expect(failures).toEqual([]);
});
