import { test, expect } from "@playwright/test";

test("dashboard loads and shows start button", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "START TEST" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Network Speedtest" })).toBeVisible();
});

test("short test runs and can be cancelled", async ({ page }) => {
  await page.goto("/?testMode=short");
  await page.getByRole("button", { name: "START TEST" }).click();
  await expect(page.getByRole("button", { name: "Cancel Test" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Test" }).click();
  await expect(page.getByRole("button", { name: "START TEST" })).toBeVisible();
});

test("theme toggle switches dark class", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByRole("button", { name: /Switch to (dark|light) mode/ });
  await btn.click();
  await expect(page.locator("html")).toHaveClass(/dark|light/);
});

test("responsive mobile viewport shows dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "START TEST" })).toBeVisible();
});

test("health endpoint is ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
});
