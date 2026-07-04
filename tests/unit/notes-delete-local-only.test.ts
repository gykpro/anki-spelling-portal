import { describe, it, expect, vi, afterEach } from "vitest";
import { DELETE } from "@/app/api/anki/notes/route";
import { NextRequest } from "next/server";

/**
 * Delete acts on the source instance only (plan 2026-07-04, Task 5).
 * Libraries are not guaranteed mirrors, so propagating a dedup delete can
 * remove the only copy of a word on another instance — propagation removed.
 */

afterEach(() => vi.unstubAllGlobals());

it("deletes only on the source instance: no profile switch, no propagation search", async () => {
  const actions: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}");
      actions.push(body.action);
      const results: Record<string, unknown> = {
        sync: null,
        deleteNotes: null,
      };
      if (!(body.action in results)) {
        return {
          ok: true,
          json: async () => ({
            result: null,
            error: `Unexpected action: ${body.action}`,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ result: results[body.action], error: null }),
      };
    })
  );

  const req = new NextRequest("http://localhost/api/anki/notes", {
    method: "DELETE",
    body: JSON.stringify({ noteIds: [111, 222] }),
  });
  const res = await DELETE(req);
  const data = await res.json();

  expect(res.status).toBe(200);
  expect(data.homeDeleted).toBe(2);
  expect(data.profileResults).toBeUndefined();
  expect(actions).toContain("deleteNotes");
  expect(actions).not.toContain("loadProfile");
  expect(actions).not.toContain("notesInfo"); // no UUID collection needed
  expect(actions).not.toContain("findNotes"); // no propagation search
});
