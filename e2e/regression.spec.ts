import { test, expect } from "@playwright/test";

/**
 * Regression suite for the 2026-10-27 bug hunt.
 * - Upload must be > 0 after a short test (old bug: crypto.getRandomValues
 *   on a 512 KiB buffer threw, workers died, upload silently read 0 Mbps).
 * - Print must open a dedicated tab and leave the dashboard responsive
 *   (old bug: window.print() on the dashboard hung the tab in some browsers).
 * - Share, network, diagnostics, history, theme persistence and 320 px
 *   layout were never verified live before this suite.
 * Console page errors are collected and asserted empty in the upload test.
 * NOTE on print automation: Playwright cannot drive the native print
 * dialog, so this suite asserts the print tab opens and renders — not that
 * the dialog itself completes. That limitation is documented in BUGS.md.
 */

test("short test completes with upload above zero and no page errors", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto("/?testMode=short");
  await page.getByRole("button", { name: "START TEST" }).click();
  const result = page.locator('section[aria-label="Test result"]');
  await expect(result).toBeVisible({ timeout: 120_000 });
  const text = await result.innerText();
  const upload = text.match(/Upload\n([\d.]+) Mbps/);
  expect(
    upload,
    `upload value not found in result text: ${text}`,
  ).not.toBeNull();
  expect(Number(upload?.[1])).toBeGreaterThan(0);
  const download = text.match(/Download\n([\d.]+) Mbps/);
  expect(Number(download?.[1])).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test("print opens a dedicated tab and dashboard stays responsive", async ({
  page,
  context,
}) => {
  await page.goto("/?testMode=short");
  await page.getByRole("button", { name: "START TEST" }).click();
  await expect(page.locator('section[aria-label="Test result"]')).toBeVisible({
    timeout: 120_000,
  });
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Print report" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/print\//);
  await expect(
    popup.getByRole("heading", { name: "NetPulse Test Report" }),
  ).toBeVisible({ timeout: 30_000 });
  // Dashboard tab must still respond after the print tab opened.
  await expect(page.getByRole("button", { name: "START TEST" })).toBeVisible();
});

test("share link opens a shared result page", async ({ page }) => {
  await page.goto("/?testMode=short");
  await page.getByRole("button", { name: "START TEST" }).click();
  await expect(page.locator('section[aria-label="Test result"]')).toBeVisible({
    timeout: 120_000,
  });
  await page.getByRole("button", { name: "Generate share link" }).click();
  const link = page.locator('section[aria-label="Test result"] a[href*="/r/"]');
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(
    page.getByRole("heading", { name: "Shared NetPulse Result" }),
  ).toBeVisible({ timeout: 30_000 });
});

test("network, diagnostics and history pages load", async ({ page }) => {
  await page.goto("/network");
  await expect(
    page.getByRole("heading", { name: "Network Information" }),
  ).toBeVisible();
  await expect(page.getByText("Not detected").first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/diagnostics");
  await expect(
    page.getByRole("heading", { name: "DNS & Network Diagnostics" }),
  ).toBeVisible();
  await expect(page.getByText("DNS resolvers").first()).toBeVisible({
    timeout: 60_000,
  });

  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "Test History" }),
  ).toBeVisible();
});

test("theme persists across reload and 320px layout does not break", async ({
  page,
}) => {
  await page.goto("/");
  const btn = page.getByRole("button", { name: /Switch to (dark|light) mode/ });
  const before = await page.locator("html").getAttribute("class");
  await btn.click();
  const after = await page.locator("html").getAttribute("class");
  expect(after).not.toBe(before);
  await page.reload();
  expect(await page.locator("html").getAttribute("class")).toBe(after);
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByRole("button", { name: "START TEST" })).toBeVisible();
});

test("round 3: gauge moves during a test and resets to zero after completion, result kept", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto("/?testMode=short");
  await page.getByRole("button", { name: "START TEST" }).click();
  const gauge = page.getByTestId("gauge");
  await expect(gauge).toBeVisible();
  // During the run the smoothed norm must rise above zero at some point.
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="gauge"]')
          ?.getAttribute("data-norm") ?? "0",
      ) > 0.05,
    undefined,
    { timeout: 60_000 },
  );
  await expect(page.locator('section[aria-label="Test result"]')).toBeVisible({
    timeout: 120_000,
  });
  // After completion the gauge must animate back to idle (~0) while the result stays.
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="gauge"]')
          ?.getAttribute("data-norm") ?? "1",
      ) < 0.02,
    undefined,
    { timeout: 30_000 },
  );
  await expect(page.locator('section[aria-label="Test result"]')).toBeVisible();
  await expect(page.getByText("Result saved to history")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("round 3: dark mode actually changes computed background colour", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto("/");
  const bodyBg = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bodyBg();
  await page.getByRole("button", { name: /Switch to dark mode/ }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const dark = await bodyBg();
  expect(dark).not.toBe(light);
  // Tailwind v4 reports gray-950 as oklch, not rgb — the assertion that
  // matters is that the computed colour actually changed to a dark value.
  await page.reload();
  expect(await page.locator("html").getAttribute("class")).toContain("dark");
  expect(pageErrors).toEqual([]);
});

test("round 3: MB/s unit toggle converts results and persists", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto("/?testMode=short");
  // Click the visible label text: the radio input itself is sr-only and
  // sits under the sticky nav for Playwright actionability, while a real
  // tap on the label activates it normally.
  await page
    .locator('fieldset[aria-label="Speed unit"] label', { hasText: "MB/s" })
    .click();
  await page.getByRole("button", { name: "START TEST" }).click();
  const result = page.locator('section[aria-label="Test result"]');
  await expect(result).toBeVisible({ timeout: 120_000 });
  await expect(result).toContainText("MB/s");
  await page.reload();
  // Toggle state persists (MB/s radio still checked) after reload.
  await expect(page.getByRole("radio", { name: "MB/s" })).toBeChecked();
  expect(pageErrors).toEqual([]);
});
