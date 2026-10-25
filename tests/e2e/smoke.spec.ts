import { expect, test, type Page } from "@playwright/test";

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("landing page renders the pitch, CTA and examples", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Opener" })).toBeVisible();
  await expect(page.getByText("Tour where your fans actually are.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan a tour" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why Qloo" })).toBeVisible();
  await expect(page.locator('a[href*="/plan?artist="]')).toHaveCount(4);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("a saved sample plan renders with provenance", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/plan?sample=fixture-artist");
  await expect(page.getByRole("heading", { level: 1, name: "Fixture Artist" })).toBeVisible();
  await expect(page.getByText(/Saved result from/)).toBeVisible();
  await expect(page.locator("#stop-1").getByRole("heading", { name: /Chicago/ })).toBeVisible();
  await expect(page.getByText("Agent interpretation").first()).toBeVisible();

  const firstStop = page.locator("#stop-1");
  await firstStop
    .getByRole("button", { name: /Qloo evidence/ })
    .last()
    .click();
  await expect(firstStop.getByText("Request input (redacted)").first()).toBeVisible();

  await expect(firstStop.getByText("Why this city · Qloo signals")).toBeVisible();

  await page.getByRole("button", { name: /Under the hood \(\d+ Qloo calls\)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Under the hood" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("qloo_where_popular").first()).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("generic vs Opener comparison works in one click", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/plan?sample=fixture-artist");
  await page.getByRole("button", { name: "Generic vs Opener" }).click();
  const panel = page.locator("#compare");
  await expect(panel.getByRole("heading", { name: "Without Qloo" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "With Qloo (Opener)" })).toBeVisible();
  await expect(panel.getByText("generic cities Opener also picked")).toBeVisible();
  await expect(panel.getByText(/^Qloo: /).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("how it works explains the architecture", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByRole("img", { name: /browser sends an artist/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tool chain" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("health endpoint never leaks secrets", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body).toHaveProperty("qloo");
  expect(body).toHaveProperty("harnessVersion");
  expect(body.configured).toEqual({ qloo: expect.any(Boolean), llm: expect.any(Boolean) });
  expect(JSON.stringify(body)).not.toMatch(/api[_-]?key/i);
});
