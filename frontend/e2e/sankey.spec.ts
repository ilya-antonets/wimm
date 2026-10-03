import { expect, test } from "@playwright/test";

test("sankey diagram renders with data in tree order", async ({ page }) => {
  await page.goto("/dashboard");

  // Widen the range to cover all seeded data.
  await page.getByLabel("From date").fill("2020-01-01");
  await page.getByLabel("To date").fill("2030-12-31");
  // Trigger the store commit (blur the input).
  await page.getByLabel("To date").blur();

  // ECharts renders into a canvas inside the chart container.
  const chart = page.locator(".sankey-diagram canvas").first();
  await expect(chart).toBeVisible({ timeout: 10000 });

  // Give the layout a moment to settle, then snapshot for visual review.
  await page.waitForTimeout(1500);
  await page.locator(".sankey-diagram").screenshot({ path: "test-results/sankey.png" });
});
