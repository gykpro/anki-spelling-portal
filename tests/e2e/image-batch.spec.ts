import { expect, test, type Page, type Route } from "@playwright/test";
import type { AnkiNote } from "../../src/types/anki";
import { makeTestCard } from "../fixtures/make-test-card";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function makeNote(noteId: number, word: string, sentence: string): AnkiNote {
  return {
    noteId,
    modelName: "school spelling",
    fields: makeTestCard({
      Word: word,
      "Main Sentence": sentence,
      Picture: "",
    }) as AnkiNote["fields"],
    tags: [],
  };
}

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installCommonApiMocks(
  page: Page,
  notes: AnkiNote[],
  handleApi: (route: Route, url: URL) => Promise<boolean>,
  distributionTargets = ""
): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/settings" && request.method() === "GET") {
      await fulfillJson(route, {
        settings: { DISTRIBUTION_TARGETS: { maskedValue: distributionTargets } },
      });
      return;
    }

    if (url.pathname === "/api/anki/notes" && request.method() === "GET") {
      await fulfillJson(route, { notes, total: notes.length });
      return;
    }

    if (url.pathname === "/api/stats" && request.method() === "GET") {
      await fulfillJson(route, { total: notes.length });
      return;
    }

    if (await handleApi(route, url)) return;

    throw new Error(
      `Unexpected API request: ${request.method()} ${url.pathname}${url.search}`
    );
  });
}

test("image batch is sequential and reports every success, failure, and not-attempted item", async ({
  page,
}) => {
  const notes = [
    makeNote(501, "__test_apple", "The test apple is red."),
    makeNote(502, "__test_banana", "The test banana is ripe."),
    makeNote(503, "__test_cherry", "The test cherry is sweet."),
  ];
  const attemptedNoteIds: number[] = [];
  let activeRequests = 0;
  let maxActiveRequests = 0;

  await installCommonApiMocks(page, notes, async (route, url) => {
    if (url.pathname !== "/api/enrich" || route.request().method() !== "POST") {
      return false;
    }

    const requestBody = (await route.request().postDataJSON()) as {
      noteId: number;
      word: string;
      fields: string[];
    };
    expect(requestBody.fields).toEqual(["image"]);
    attemptedNoteIds.push(requestBody.noteId);
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

    // Keep each mocked request in flight briefly so accidental parallelism is observable.
    await new Promise((resolve) => setTimeout(resolve, 75));
    activeRequests -= 1;

    if (requestBody.noteId === 502) {
      // The route currently encodes provider failures in an HTTP-200 response.
      await fulfillJson(route, {
        noteId: requestBody.noteId,
        word: requestBody.word,
        image_error: "provider refused this item",
      });
      return true;
    }

    await fulfillJson(route, {
      noteId: requestBody.noteId,
      word: requestBody.word,
      image: { base64: PNG_BASE64, mimeType: "image/png" },
    });
    return true;
  });

  await page.goto("/enrich?noteIds=501,502,503");
  await page.getByTestId("image-batch-generate").click();

  await expect.poll(() => attemptedNoteIds).toEqual([501, 502, 503]);
  expect(maxActiveRequests).toBe(1);

  await expect(page.getByTestId(/^image-batch-outcome-/)).toHaveCount(3);
  await expect(page.getByTestId("image-batch-outcome-501")).toContainText(
    "succeeded"
  );
  const failedOutcome = page.getByTestId("image-batch-outcome-502");
  await expect(failedOutcome).toContainText("__test_banana");
  await expect(failedOutcome).toContainText("failed");
  await expect(failedOutcome).toContainText("provider refused this item");
  await expect(page.getByTestId("image-batch-outcome-503")).toContainText(
    "succeeded"
  );

  const summary = page.getByTestId("image-batch-summary");
  await expect
    .soft(summary)
    .toHaveText("2 succeeded, 1 failed, 0 not attempted");
  await expect
    .soft(summary)
    .not.toContainText(/images done for 3 cards|all.*done/i);
});

test("failed image media finalization does not update Picture or show saved success", async ({
  page,
}) => {
  const note = makeNote(701, "__test_pear", "The test pear is green.");
  let mediaPosts = 0;
  const noteUpdateBodies: Array<{ fields?: Record<string, string> }> = [];

  await installCommonApiMocks(page, [note], async (route, url) => {
    const request = route.request();

    if (url.pathname === "/api/enrich" && request.method() === "POST") {
      await fulfillJson(route, {
        noteId: 701,
        word: "__test_pear",
        image: { base64: PNG_BASE64, mimeType: "image/png" },
      });
      return true;
    }

    if (url.pathname === "/api/anki/media" && request.method() === "POST") {
      mediaPosts += 1;
      await fulfillJson(route, { error: "media store failed" }, 500);
      return true;
    }

    if (url.pathname === "/api/anki/notes/701" && request.method() === "PUT") {
      noteUpdateBodies.push(
        (await request.postDataJSON()) as { fields?: Record<string, string> }
      );
      await fulfillJson(route, { updated: true });
      return true;
    }

    return false;
  });

  await page.goto("/enrich?noteIds=701");
  await page.getByTestId("image-batch-generate").click();

  const saveButton = page.getByTestId("image-save");
  await expect(saveButton).toBeVisible();

  const mediaResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/anki/media" &&
      response.request().method() === "POST"
  );
  await saveButton.click();
  const mediaResponse = await mediaResponsePromise;
  expect(mediaResponse.status()).toBe(500);

  // Give the save chain a bounded turn to make any forbidden note update observable.
  await page.waitForTimeout(250);
  expect(mediaPosts).toBe(1);
  expect(
    noteUpdateBodies.every((body) => body.fields?.Picture === undefined)
  ).toBe(true);
  await expect(page.getByTestId("image-save-error")).toContainText(
    "media store failed"
  );
  await expect(saveButton).toBeVisible();
});

test("save all counts a failed image finalization as failed and does not distribute it", async ({
  page,
}) => {
  const note = makeNote(801, "__test_plum", "The test plum is purple.");
  const noteUpdateBodies: Array<{ fields?: Record<string, string> }> = [];
  let distributionCalls = 0;

  await installCommonApiMocks(page, [note], async (route, url) => {
    const request = route.request();

    if (url.pathname === "/api/enrich" && request.method() === "POST") {
      await fulfillJson(route, {
        noteId: 801,
        word: "__test_plum",
        image: { base64: PNG_BASE64, mimeType: "image/png" },
      });
      return true;
    }
    if (url.pathname === "/api/anki/media" && request.method() === "POST") {
      await fulfillJson(route, { error: "media store failed" }, 500);
      return true;
    }
    if (url.pathname === "/api/anki/notes/801" && request.method() === "PUT") {
      noteUpdateBodies.push(
        (await request.postDataJSON()) as { fields?: Record<string, string> }
      );
      await fulfillJson(route, { updated: true });
      return true;
    }
    if (url.pathname === "/api/anki/distribute" && request.method() === "POST") {
      distributionCalls += 1;
      await fulfillJson(route, { results: [] });
      return true;
    }
    return false;
  }, "Gao Tian=http://127.0.0.1:8771");

  await page.goto("/enrich?noteIds=801");
  await page.getByTestId("image-batch-generate").click();
  await expect(page.getByTestId("image-save")).toBeVisible();

  const mediaResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/anki/media" &&
      response.request().method() === "POST"
  );
  await page.getByTestId("save-all").click();
  expect((await mediaResponsePromise).status()).toBe(500);

  await expect(page.getByTestId("save-all-summary")).toHaveText(
    "0 saved, 1 failed"
  );
  expect(
    noteUpdateBodies.every((body) => body.fields?.Picture === undefined)
  ).toBe(true);
  expect(distributionCalls).toBe(0);
  await expect(page.getByTestId("image-save-error")).toContainText(
    "media store failed"
  );
});
