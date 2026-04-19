/**
 * Helpers for cleaning up __test_* notes from Anki between test runs.
 * Assumes Anki is running on ANKI_CONNECT_URL (default http://localhost:8765)
 * on a profile that has both Gao English Spelling and Gao Chinese decks.
 */

const ANKI_URL = process.env.ANKI_CONNECT_URL || "http://localhost:8765";

async function ankiConnect<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ANKI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params }),
  });
  if (!res.ok) {
    throw new Error(`AnkiConnect request failed: ${res.status}`);
  }
  const data = (await res.json()) as { result: T; error: string | null };
  if (data.error) {
    throw new Error(`AnkiConnect error (${action}): ${data.error}`);
  }
  return data.result;
}

export async function findTestNotes(): Promise<number[]> {
  const decks = ["Gao English Spelling", "Gao Chinese"];
  const ids = new Set<number>();
  for (const deck of decks) {
    try {
      const found = await ankiConnect<number[]>("findNotes", { query: `deck:"${deck}" __test_*` });
      found.forEach((id) => ids.add(id));
    } catch {
      // Deck may not exist in this profile — skip silently.
    }
  }
  return Array.from(ids);
}

export async function cleanTestNotes(): Promise<number> {
  const ids = await findTestNotes();
  if (ids.length === 0) return 0;
  await ankiConnect("deleteNotes", { notes: ids });
  return ids.length;
}

export async function pingAnki(): Promise<boolean> {
  try {
    await ankiConnect<number>("version");
    return true;
  } catch {
    return false;
  }
}
