import { expect, test } from "@playwright/test";

test.describe("WIMM smoke tests", () => {
  test("redirects index to dashboard and shows heading", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("nav links are present and branded", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("WIMM")).toBeVisible();
    await expect(page.getByRole("link", { name: /Dashboard/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Transactions/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Settings/i })).toBeVisible();
  });

  test("navigates to Transactions page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Transactions/i }).click();
    await expect(page).toHaveURL(/\/transactions/);
    // TransactionsPage has no top-level "Transactions" heading; check the
    // category sidebar which is the primary landmark on this route.
    await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
  });

  test("navigates to Settings page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("light/dark toggle switches color scheme", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");

    // default is light
    await expect(html).toHaveAttribute("data-mantine-color-scheme", "light");

    // click moon/toggle button
    await page.getByRole("button", { name: "Toggle color scheme" }).click();
    await expect(html).toHaveAttribute("data-mantine-color-scheme", "dark");

    // toggle back
    await page.getByRole("button", { name: "Toggle color scheme" }).click();
    await expect(html).toHaveAttribute("data-mantine-color-scheme", "light");
  });

  test("Import CSV button opens import modal", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Import CSV/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Import CSV" })).toBeVisible();
  });

  test("Settings page shows Add Bank button", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: /Add Bank/i })).toBeVisible();
  });

  test("Add Bank opens bank config modal", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: /Add Bank/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add Bank" })).toBeVisible();
  });
});
