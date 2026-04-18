import { cleanTestNotes, pingAnki } from "./anki-test-helpers";

/**
 * Playwright global setup — runs once before all specs.
 * - Verifies Anki is reachable.
 * - Cleans leftover __test_* notes from previous runs.
 */
export default async function globalSetup() {
  const reachable = await pingAnki();
  if (!reachable) {
    throw new Error(
      "Anki is not reachable via AnkiConnect. Start Anki on the Test profile before running e2e tests."
    );
  }
  const cleaned = await cleanTestNotes();
  if (cleaned > 0) {
    console.log(`[playwright-globals] Cleaned ${cleaned} leftover __test_* notes.`);
  }
}
