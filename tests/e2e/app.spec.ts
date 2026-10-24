import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const width of [375, 768, 1440]) {
  test(`landing validates URLs and fits ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /We break your app|Break it now/ })).toBeVisible();
    const input = page.getByRole("textbox", { name: /Website URL to audit|Your app URL/ });
    await input.fill("http://127.0.0.1");
    await page.getByRole("button", { name: /Run free (deterministic )?audit/i }).click();
    await expect(page.getByText(/Only public web URLs can be audited/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`landing-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("invalid report link has a recovery path", async ({ page }) => {
  await page.goto("/audit/invalid");
  await expect(page.getByRole("heading", { name: "Unable to open this page" })).toBeVisible();
  await page.getByRole("link", { name: "Back to the breaker" }).click();
  await expect(page.getByRole("heading", { name: /We break your app|Break it now/ })).toBeVisible();
});

test("live audit: submit, progress, completed report, reload, and back", async ({ page }, testInfo) => {
  test.skip(!process.env.RUN_LIVE_E2E, "Set RUN_LIVE_E2E=1 for the real Convex + Solari integration (uses a cloud browser session).");
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("textbox", { name: /Website URL to audit|Your app URL/ }).fill("https://example.com/?qa=e2e-v1-1");
  await page.getByRole("button", { name: /Run free (deterministic )?audit/i }).click();
  await expect(page).toHaveURL(/\/audit\/[a-z0-9]+/, { timeout: 20_000 });
  const reportUrl = page.url();
  await expect(page.getByRole("heading", { name: "Example", exact: true })).toBeVisible();
  await expect(page.getByText("completed", { exact: true }).first()).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText("run failed", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Example", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("completed-report.png"), fullPage: true });
  await page.goBack();
  await expect(page.getByRole("heading", { name: /We break your app|Break it now/ })).toBeVisible();
  expect(errors).toEqual([]);
  await testInfo.attach("report", { body: reportUrl, contentType: "text/plain" });
});
