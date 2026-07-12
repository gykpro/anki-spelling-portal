import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mapEnrichResultToAnkiFields } from "../../skill/scripts/lib/anki-fields.mjs";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CLI image media finalization", () => {
  it("rejects an empty image before calling the media endpoint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      mapEnrichResultToAnkiFields(1, "cat", {
        image: { base64: "", mimeType: "image/png" },
      })
    ).rejects.toThrow(/image/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates media-store failure instead of returning an empty Picture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: "media store failed" }),
      })
    );

    await expect(
      mapEnrichResultToAnkiFields(1, "cat", {
        image: { base64: PNG_BASE64, mimeType: "image/png" },
      })
    ).rejects.toThrow(/media store failed/i);
  });
});

type ScriptResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length > 0
    ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>)
    : {};
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function withPortal(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  run: (url: string) => Promise<void>
) {
  const server = createServer((request, response) => {
    handler(request, response).catch((error) => {
      sendJson(response, 500, { error: String(error) });
    });
  });
  await new Promise<void>((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen)
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    );
  }
}

function runScript(script: string, args: string[], portalUrl: string): Promise<ScriptResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [resolve(process.cwd(), script), ...args], {
      env: { ...process.env, ANKI_PORTAL_URL: portalUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", rejectRun);
    child.once("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

function healthPayload() {
  return {
    ok: true,
    checks: {
      ankiConnect: true,
      languages: { english: { deck: true, model: true } },
    },
  };
}

describe("CLI per-card image outcomes", () => {
  it("image-only treats an HTTP-200 response without an image as failed", async () => {
    await withPortal(async (request, response) => {
      const url = new URL(request.url || "/", "http://portal");
      if (url.pathname === "/api/health") return sendJson(response, 200, healthPayload());
      if (url.pathname === "/api/anki/notes") {
        return sendJson(response, 200, {
          notes: [
            {
              noteId: 1,
              fields: {
                Word: { value: "cat" },
                "Main Sentence": { value: "The cat sleeps." },
              },
            },
          ],
        });
      }
      if (url.pathname === "/api/enrich") return sendJson(response, 200, {});
      return sendJson(response, 404, { error: `unexpected ${url.pathname}` });
    }, async (portalUrl) => {
      const result = await runScript(
        "skill/scripts/enrich-image.mjs",
        ["--noteIds", "1"],
        portalUrl
      );
      const summary = JSON.parse(result.stdout);

      expect(result.code).toBe(2);
      expect(summary).toMatchObject({ succeeded: 0, failed: 1, notAttempted: 0 });
      expect(summary.results[0]).toMatchObject({ noteId: 1, status: "failed" });
      expect(summary.results[0].error).toMatch(/image|picture/i);
    });
  });

  it("image-only exits failed when the generated PNG cannot be finalized", async () => {
    await withPortal(async (request, response) => {
      const url = new URL(request.url || "/", "http://portal");
      if (url.pathname === "/api/health") return sendJson(response, 200, healthPayload());
      if (url.pathname === "/api/anki/notes") {
        return sendJson(response, 200, {
          notes: [
            {
              noteId: 1,
              fields: {
                Word: { value: "cat" },
                "Main Sentence": { value: "The cat sleeps." },
              },
            },
          ],
        });
      }
      if (url.pathname === "/api/enrich") {
        return sendJson(response, 200, {
          image: { base64: PNG_BASE64, mimeType: "image/png" },
        });
      }
      if (url.pathname === "/api/anki/media") {
        return sendJson(response, 500, { error: "media store failed" });
      }
      return sendJson(response, 404, { error: `unexpected ${url.pathname}` });
    }, async (portalUrl) => {
      const result = await runScript(
        "skill/scripts/enrich-image.mjs",
        ["--noteIds", "1"],
        portalUrl
      );
      const summary = JSON.parse(result.stdout);

      expect(result.code).toBe(2);
      expect(summary).toMatchObject({ succeeded: 0, failed: 1, notAttempted: 0 });
      expect(summary.results[0]).toMatchObject({
        noteId: 1,
        status: "failed",
      });
      expect(summary.results[0].error).toMatch(/media store failed/i);
    });
  });

  it("image-only records a missing sentence as not attempted", async () => {
    await withPortal(async (request, response) => {
      const url = new URL(request.url || "/", "http://portal");
      if (url.pathname === "/api/health") return sendJson(response, 200, healthPayload());
      if (url.pathname === "/api/anki/notes") {
        return sendJson(response, 200, {
          notes: [
            {
              noteId: 1,
              fields: {
                Word: { value: "cat" },
                "Main Sentence": { value: "" },
              },
            },
          ],
        });
      }
      return sendJson(response, 404, { error: `unexpected ${url.pathname}` });
    }, async (portalUrl) => {
      const result = await runScript(
        "skill/scripts/enrich-image.mjs",
        ["--noteIds", "1"],
        portalUrl
      );
      const summary = JSON.parse(result.stdout);

      expect(result.code).toBe(2);
      expect(summary).toMatchObject({ succeeded: 0, failed: 0, notAttempted: 1 });
      expect(summary.results[0]).toMatchObject({
        noteId: 1,
        status: "not_attempted",
      });
    });
  });

  it("image-only uses partial-success exit 1 when one card succeeds and one fails", async () => {
    await withPortal(async (request, response) => {
      const url = new URL(request.url || "/", "http://portal");
      if (url.pathname === "/api/health") return sendJson(response, 200, healthPayload());
      if (url.pathname === "/api/anki/notes" && request.method === "GET") {
        return sendJson(response, 200, {
          notes: [
            {
              noteId: 1,
              fields: {
                Word: { value: "cat" },
                "Main Sentence": { value: "The cat sleeps." },
              },
            },
            {
              noteId: 2,
              fields: {
                Word: { value: "dog" },
                "Main Sentence": { value: "The dog runs." },
              },
            },
          ],
        });
      }
      if (url.pathname === "/api/enrich") {
        return sendJson(response, 200, {
          image: { base64: PNG_BASE64, mimeType: "image/png" },
        });
      }
      if (url.pathname === "/api/anki/media") {
        const body = await readJsonBody(request);
        const filename = String(body.filename || "");
        return filename.includes("_2.png")
          ? sendJson(response, 500, { error: "media store failed" })
          : sendJson(response, 200, { filename });
      }
      if (url.pathname.startsWith("/api/anki/notes/") && request.method === "PUT") {
        return sendJson(response, 200, { success: true });
      }
      return sendJson(response, 404, { error: `unexpected ${url.pathname}` });
    }, async (portalUrl) => {
      const result = await runScript(
        "skill/scripts/enrich-image.mjs",
        ["--noteIds", "1,2"],
        portalUrl
      );
      const summary = JSON.parse(result.stdout);

      expect(result.code).toBe(1);
      expect(summary).toMatchObject({ succeeded: 1, failed: 1, notAttempted: 0 });
      expect(summary.results.map((item: { status: string }) => item.status)).toEqual([
        "succeeded",
        "failed",
      ]);
    });
  });

  it.each([
    ["note IDs", ["--noteIds", "1,999"], { noteId: 999 }],
    ["words", ["--words", "cat,missing"], { word: "missing" }],
  ])(
    "image-only keeps an unresolved requested %s item as not attempted",
    async (_label, args, unresolvedIdentity) => {
      await withPortal(async (request, response) => {
        const url = new URL(request.url || "/", "http://portal");
        if (url.pathname === "/api/health") return sendJson(response, 200, healthPayload());
        if (url.pathname === "/api/anki/notes" && request.method === "GET") {
          return sendJson(response, 200, {
            notes: [
              {
                noteId: 1,
                fields: {
                  Word: { value: "cat" },
                  "Main Sentence": { value: "The cat sleeps." },
                },
              },
            ],
          });
        }
        if (url.pathname === "/api/enrich") {
          return sendJson(response, 200, {
            image: { base64: PNG_BASE64, mimeType: "image/png" },
          });
        }
        if (url.pathname === "/api/anki/media") {
          const body = await readJsonBody(request);
          return sendJson(response, 200, { filename: body.filename });
        }
        if (url.pathname === "/api/anki/notes/1" && request.method === "PUT") {
          return sendJson(response, 200, { success: true });
        }
        return sendJson(response, 404, { error: `unexpected ${url.pathname}` });
      }, async (portalUrl) => {
        const result = await runScript(
          "skill/scripts/enrich-image.mjs",
          args as string[],
          portalUrl
        );
        const summary = JSON.parse(result.stdout);

        expect(result.code).toBe(1);
        expect(summary).toMatchObject({ succeeded: 1, failed: 0, notAttempted: 1 });
        expect(summary.results).toHaveLength(2);
        expect(summary.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              ...unresolvedIdentity,
              status: "not_attempted",
            }),
          ])
        );
      });
    }
  );

  it("full enrichment keeps an unresolved requested note ID as not attempted", async () => {
    await withPortal(async (request, response) => {
      const url = new URL(request.url || "/", "http://portal");
      if (url.pathname === "/api/health") return sendJson(response, 200, healthPayload());
      if (url.pathname === "/api/anki/notes" && request.method === "GET") {
        return sendJson(response, 200, {
          notes: [
            {
              noteId: 1,
              fields: {
                Word: { value: "cat" },
                "Main Sentence": { value: "The cat sleeps." },
              },
            },
          ],
        });
      }
      if (url.pathname === "/api/enrich/batch") {
        return sendJson(response, 200, {
          results: [{ noteId: 1, word: "cat", definition: "a small animal" }],
          succeeded: 1,
          failed: 0,
        });
      }
      if (url.pathname === "/api/enrich") {
        const body = await readJsonBody(request);
        const fields = body.fields as string[];
        return fields.includes("image")
          ? sendJson(response, 200, {
              image: { base64: PNG_BASE64, mimeType: "image/png" },
            })
          : sendJson(response, 200, {
              audio: { base64: "YXVkaW8=", format: "mp3" },
              sentence_audio: { base64: "YXVkaW8=", format: "mp3" },
            });
      }
      if (url.pathname === "/api/anki/media") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, { filename: body.filename });
      }
      if (url.pathname === "/api/anki/notes/1" && request.method === "PUT") {
        return sendJson(response, 200, { success: true });
      }
      return sendJson(response, 404, { error: `unexpected ${url.pathname}` });
    }, async (portalUrl) => {
      const result = await runScript(
        "skill/scripts/enrich-full.mjs",
        ["--noteIds", "1,999"],
        portalUrl
      );
      const summary = JSON.parse(result.stdout);

      expect(result.code).toBe(1);
      expect(summary).toMatchObject({ succeeded: 1, failed: 0, notAttempted: 1 });
      expect(summary.results).toHaveLength(2);
      expect(summary.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ noteId: 999, status: "not_attempted" }),
        ])
      );
    });
  });

  it("full enrichment cannot report success when its image phase failed", async () => {
    await withPortal(async (request, response) => {
      const url = new URL(request.url || "/", "http://portal");
      if (url.pathname === "/api/health") return sendJson(response, 200, healthPayload());
      if (url.pathname === "/api/anki/notes" && request.method === "GET") {
        return sendJson(response, 200, {
          notes: [
            {
              noteId: 1,
              fields: {
                Word: { value: "cat" },
                "Main Sentence": { value: "The cat sleeps." },
              },
            },
          ],
        });
      }
      if (url.pathname === "/api/enrich/batch") {
        return sendJson(response, 200, {
          results: [{ noteId: 1, word: "cat", definition: "a small animal" }],
          succeeded: 1,
          failed: 0,
        });
      }
      if (url.pathname === "/api/enrich") {
        const body = await readJsonBody(request);
        const fields = body.fields as string[];
        return fields.includes("image")
          ? sendJson(response, 200, { image_error: "image blocked" })
          : sendJson(response, 200, {});
      }
      if (url.pathname === "/api/anki/notes/1" && request.method === "PUT") {
        return sendJson(response, 200, { success: true });
      }
      return sendJson(response, 404, { error: `unexpected ${url.pathname}` });
    }, async (portalUrl) => {
      const result = await runScript(
        "skill/scripts/enrich-full.mjs",
        ["--noteIds", "1"],
        portalUrl
      );
      const summary = JSON.parse(result.stdout);

      expect(result.code).toBe(2);
      expect(summary).toMatchObject({ succeeded: 0, failed: 1 });
      expect(summary.results[0]).toMatchObject({ noteId: 1, status: "failed" });
      expect(summary.results[0].error).toMatch(/image blocked/i);
    });
  });

  it.each([
    ["note IDs", ["--noteIds", "1,1"]],
    ["words", ["--words", "cat,cat"]],
  ])(
    "full enrichment preserves duplicate requested %s as separate outcomes",
    async (_label, args) => {
      let imageAttempt = 0;
      await withPortal(async (request, response) => {
        const url = new URL(request.url || "/", "http://portal");
        if (url.pathname === "/api/health") {
          return sendJson(response, 200, healthPayload());
        }
        if (
          url.pathname === "/api/anki/notes" &&
          url.searchParams.has("checkDuplicates")
        ) {
          return sendJson(response, 200, {
            duplicates: ["cat"],
            newWords: [],
          });
        }
        if (url.pathname === "/api/anki/notes" && request.method === "GET") {
          return sendJson(response, 200, {
            notes: [
              {
                noteId: 1,
                fields: {
                  Word: { value: "cat" },
                  "Main Sentence": { value: "The cat sleeps." },
                },
              },
            ],
          });
        }
        if (url.pathname === "/api/enrich/batch") {
          const body = await readJsonBody(request);
          const cards = body.cards as Array<{ noteId: number; word: string }>;
          return sendJson(response, 200, {
            results: cards.map((card) => ({
              noteId: card.noteId,
              word: card.word,
              definition: "a small animal",
            })),
          });
        }
        if (url.pathname === "/api/enrich") {
          const body = await readJsonBody(request);
          const fields = body.fields as string[];
          if (fields.includes("image")) {
            imageAttempt++;
            return sendJson(response, 200, {
              image: { base64: PNG_BASE64, mimeType: "image/png" },
            });
          }
          return sendJson(response, 200, {});
        }
        if (url.pathname === "/api/anki/media") {
          const body = await readJsonBody(request);
          if (String(body.filename).endsWith(".png") && imageAttempt === 2) {
            return sendJson(response, 500, { error: "second image failed" });
          }
          return sendJson(response, 200, { filename: body.filename });
        }
        if (
          url.pathname === "/api/anki/notes/1" &&
          request.method === "PUT"
        ) {
          return sendJson(response, 200, { success: true });
        }
        return sendJson(response, 404, { error: `unexpected ${url.pathname}` });
      }, async (portalUrl) => {
        const result = await runScript(
          "skill/scripts/enrich-full.mjs",
          args as string[],
          portalUrl
        );
        const summary = JSON.parse(result.stdout);

        expect(result.code).toBe(1);
        expect(imageAttempt).toBe(2);
        expect(summary).toMatchObject({
          succeeded: 1,
          failed: 1,
          notAttempted: 0,
        });
        expect(summary.results.map((item: { status: string }) => item.status)).toEqual([
          "succeeded",
          "failed",
        ]);
      });
    }
  );

  it("worksheet enrichment forwards the full-pipeline JSON and exit status", async () => {
    const tempDirectory = mkdtempSync(resolve(tmpdir(), "__test_worksheet-"));
    const imagePath = resolve(tempDirectory, "__test_page.png");
    writeFileSync(imagePath, Buffer.from(PNG_BASE64, "base64"));

    try {
      await withPortal(async (request, response) => {
        const url = new URL(request.url || "/", "http://portal");
        if (url.pathname === "/api/health") {
          return sendJson(response, 200, healthPayload());
        }
        if (url.pathname === "/api/extract") {
          return sendJson(response, 200, {
            pages: [
              {
                termWeek: "__test_week",
                topic: "__test_topic",
                sentences: [{ word: "cat", sentence: "The cat sleeps." }],
              },
            ],
          });
        }
        if (
          url.pathname === "/api/anki/notes" &&
          url.searchParams.has("checkDuplicates")
        ) {
          return sendJson(response, 200, {
            duplicates: ["cat"],
            newWords: [],
          });
        }
        if (url.pathname === "/api/anki/notes" && request.method === "GET") {
          return sendJson(response, 200, {
            notes: [
              {
                noteId: 1,
                fields: {
                  Word: { value: "cat" },
                  "Main Sentence": { value: "The cat sleeps." },
                },
              },
            ],
          });
        }
        if (url.pathname === "/api/enrich/batch") {
          return sendJson(response, 200, {
            results: [{ noteId: 1, word: "cat", definition: "a small animal" }],
          });
        }
        if (url.pathname === "/api/enrich") {
          const body = await readJsonBody(request);
          const fields = body.fields as string[];
          return fields.includes("image")
            ? sendJson(response, 200, { image_error: "image blocked" })
            : sendJson(response, 200, {});
        }
        if (
          url.pathname === "/api/anki/notes/1" &&
          request.method === "PUT"
        ) {
          return sendJson(response, 200, { success: true });
        }
        return sendJson(response, 404, { error: `unexpected ${url.pathname}` });
      }, async (portalUrl) => {
        const result = await runScript(
          "skill/scripts/extract-worksheet.mjs",
          ["--images", imagePath, "--enrich"],
          portalUrl
        );
        const summary = JSON.parse(result.stdout);

        expect(result.code).toBe(2);
        expect(summary).toMatchObject({
          succeeded: 0,
          failed: 1,
          notAttempted: 0,
        });
        expect(summary.results[0]).toMatchObject({
          noteId: 1,
          status: "failed",
        });
      });
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
