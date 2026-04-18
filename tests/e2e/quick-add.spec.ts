import { test, expect } from "@playwright/test";
import { findTestNotes, cleanTestNotes } from "../setup/anki-test-helpers";

test.beforeEach(async () => {
  await cleanTestNotes();
});

test.afterEach(async () => {
  await cleanTestNotes();
});

test("Quick Add creates 3 cards from 3 words", async ({ page }) => {
  await page.goto("/quick-add");

  await page.getByTestId("quick-add-input").fill(
    ["__test_apple", "__test_banana", "__test_cherry"].join("\n")
  );

  await page.getByTestId("quick-add-submit").click();

  await expect(page.getByTestId("quick-add-success")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("quick-add-success")).toContainText("3");

  const ids = await findTestNotes();
  expect(ids.length).toBe(3);
});
