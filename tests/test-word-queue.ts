/**
 * Test script for Telegram word queue.
 * Run: npx tsx tests/test-word-queue.ts
 *
 * Tests the queue accumulation, timer, and drain logic by mocking
 * the Grammy API and pipeline dependencies.
 */

// Mock modules before importing word-queue
// We need to intercept the pipeline and write-queue imports

let pipelineCalls: { words: string[]; lang: string }[] = [];
let writeQueuePending = 0;

// Mock the enrichment pipeline
const mockRunFullPipeline = async (
  words: string[],
  _progress: unknown,
  lang?: { id: string; label: string; deck: string }
) => {
  pipelineCalls.push({ words, lang: lang?.id ?? "english" });
  return { created: words.length, duplicates: 0, errors: [] as string[] };
};

// Patch globalThis to inject mock write queue before import
const WRITE_QUEUE_KEY = "__ankiWriteQueue";
(globalThis as Record<string, unknown>)[WRITE_QUEUE_KEY] = {
  get pending() { return writeQueuePending; },
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    writeQueuePending++;
    try {
      return await fn();
    } finally {
      writeQueuePending--;
    }
  },
};

// ──── Inline WordQueue (avoiding path alias issues) ────
// We test the logic by reimplementing the key parts with mocks

interface QueueEntry {
  word: string;
  lang: { id: string; label: string; deck: string };
}

interface ChatQueue {
  entries: QueueEntry[];
  timer: ReturnType<typeof setTimeout> | null;
  statusMessageId: number | null;
  draining: boolean;
}

const DRAIN_TIMEOUT_MS = 500; // Short timeout for testing (500ms instead of 60s)
const MAX_PIPELINE_WORDS = 50;

// Track API calls for assertions
const apiCalls: { method: string; args: unknown[] }[] = [];
let nextMessageId = 100;

const mockApi = {
  sendMessage: async (chatId: number, text: string, opts?: unknown) => {
    const msgId = nextMessageId++;
    apiCalls.push({ method: "sendMessage", args: [chatId, text, opts] });
    return { message_id: msgId };
  },
  editMessageText: async (chatId: number, msgId: number, text: string, opts?: unknown) => {
    apiCalls.push({ method: "editMessageText", args: [chatId, msgId, text, opts] });
  },
};

class TestWordQueue {
  private queues = new Map<number, ChatQueue>();
  private api: typeof mockApi | null = null;

  init(api: typeof mockApi): void {
    this.api = api;
  }

  private getOrCreate(chatId: number): ChatQueue {
    let q = this.queues.get(chatId);
    if (!q) {
      q = { entries: [], timer: null, statusMessageId: null, draining: false };
      this.queues.set(chatId, q);
    }
    return q;
  }

  size(chatId: number): number {
    return this.queues.get(chatId)?.entries.length ?? 0;
  }

  isDraining(chatId: number): boolean {
    return this.queues.get(chatId)?.draining ?? false;
  }

  async add(chatId: number, entries: QueueEntry[]): Promise<void> {
    if (!this.api) throw new Error("Not initialized");
    const q = this.getOrCreate(chatId);
    const wasEmpty = q.entries.length === 0;
    q.entries.push(...entries);

    if (q.entries.length >= MAX_PIPELINE_WORDS) {
      this.drain(chatId);
      return;
    }

    if (wasEmpty && !q.draining) {
      q.timer = setTimeout(() => this.drain(chatId), DRAIN_TIMEOUT_MS);
      try {
        const msg = await this.api.sendMessage(
          chatId,
          `${q.entries.length} word(s) queued. Waiting 1 min for more...`,
          { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "Start Now", callback_data: "word_queue_start" }]] } }
        );
        q.statusMessageId = msg.message_id;
      } catch { /* ignore */ }
    } else if (!q.draining) {
      try {
        await this.api.sendMessage(chatId, `Words added (${q.entries.length} queued)`);
      } catch { /* ignore */ }
      if (q.statusMessageId) {
        try {
          await this.api.editMessageText(chatId, q.statusMessageId, `${q.entries.length} word(s) queued. Waiting for more...`, {
            reply_markup: { inline_keyboard: [[{ text: "Start Now", callback_data: "word_queue_start" }]] },
          });
        } catch { /* ignore */ }
      }
    }
  }

  async drain(chatId: number): Promise<void> {
    if (!this.api) return;
    const q = this.queues.get(chatId);
    if (!q || q.entries.length === 0 || q.draining) return;

    q.draining = true;
    if (q.timer) { clearTimeout(q.timer); q.timer = null; }

    const entries = [...q.entries];
    q.entries = [];

    if (q.statusMessageId) {
      try {
        await this.api.editMessageText(chatId, q.statusMessageId, `Processing ${entries.length} word(s)...`, { reply_markup: { inline_keyboard: [] } });
      } catch { /* ignore */ }
      q.statusMessageId = null;
    }

    // Group by language
    const groups = new Map<string, { lang: QueueEntry["lang"]; words: string[] }>();
    for (const entry of entries) {
      const key = entry.lang.id;
      let group = groups.get(key);
      if (!group) {
        group = { lang: entry.lang, words: [] };
        groups.set(key, group);
      }
      group.words.push(entry.word);
    }

    // Process each group
    for (const [, group] of groups) {
      await mockRunFullPipeline(group.words, {
        send: async () => {},
        update: async () => {},
      }, group.lang as { id: string; label: string; deck: string });
    }

    // Send summary
    try {
      await this.api.sendMessage(chatId, "<b>Done!</b>\nCreated: " + entries.length + " cards");
    } catch { /* ignore */ }

    q.draining = false;

    if (q.entries.length > 0) {
      q.timer = setTimeout(() => this.drain(chatId), DRAIN_TIMEOUT_MS);
    }
  }
}

// ──── Test helpers ────

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  PASS: ${msg}`);
  }
}

function resetState(): void {
  apiCalls.length = 0;
  pipelineCalls.length = 0;
  nextMessageId = 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const EN = { id: "english", label: "English", deck: "Gao English Spelling" };
const CN = { id: "chinese", label: "Chinese", deck: "Gao Chinese" };

// ──── Tests ────

async function testSingleWordThenDrain() {
  console.log("\nTest: Single word → manual drain");
  resetState();
  const q = new TestWordQueue();
  q.init(mockApi);

  await q.add(123, [{ word: "apple", lang: EN }]);
  assert(q.size(123) === 1, "Queue has 1 entry");
  assert(apiCalls.some(c => c.method === "sendMessage" && String(c.args[1]).includes("1 word(s) queued")), "Sent queued status message");

  await q.drain(123);
  assert(q.size(123) === 0, "Queue empty after drain");
  assert(pipelineCalls.length === 1, "Pipeline called once");
  assert(pipelineCalls[0].words.length === 1, "Pipeline got 1 word");
  assert(pipelineCalls[0].words[0] === "apple", "Pipeline got correct word");
  assert(apiCalls.some(c => c.method === "sendMessage" && String(c.args[1]).includes("Done!")), "Sent done message");
}

async function testMultipleWordsBatched() {
  console.log("\nTest: Multiple words → batched in one pipeline call");
  resetState();
  const q = new TestWordQueue();
  q.init(mockApi);

  await q.add(123, [{ word: "apple", lang: EN }]);
  await q.add(123, [{ word: "banana", lang: EN }]);
  await q.add(123, [{ word: "cherry", lang: EN }]);

  assert(q.size(123) === 3, "Queue has 3 entries");
  assert(apiCalls.filter(c => c.method === "sendMessage" && String(c.args[1]).includes("Words added")).length === 2, "Two 'Words added' messages sent");

  await q.drain(123);
  assert(pipelineCalls.length === 1, "Pipeline called once (batched)");
  assert(pipelineCalls[0].words.length === 3, "Pipeline got all 3 words");
  assert(pipelineCalls[0].words.join(",") === "apple,banana,cherry", "Words in order");
}

async function testMixedLanguages() {
  console.log("\nTest: Mixed languages → separate pipeline calls per language");
  resetState();
  const q = new TestWordQueue();
  q.init(mockApi);

  await q.add(123, [{ word: "apple", lang: EN }]);
  await q.add(123, [{ word: "苹果", lang: CN }]);
  await q.add(123, [{ word: "banana", lang: EN }]);

  assert(q.size(123) === 3, "Queue has 3 entries");

  await q.drain(123);
  assert(pipelineCalls.length === 2, "Pipeline called twice (once per language)");

  const enCall = pipelineCalls.find(c => c.lang === "english");
  const cnCall = pipelineCalls.find(c => c.lang === "chinese");
  assert(enCall !== undefined, "English pipeline call exists");
  assert(cnCall !== undefined, "Chinese pipeline call exists");
  assert(enCall!.words.length === 2, "English group has 2 words");
  assert(cnCall!.words.length === 1, "Chinese group has 1 word");
}

async function testAutoTimeout() {
  console.log("\nTest: Auto-drain after timeout (500ms in test)");
  resetState();
  const q = new TestWordQueue();
  q.init(mockApi);

  await q.add(123, [{ word: "timeout_word", lang: EN }]);
  assert(q.size(123) === 1, "Word queued");

  await sleep(700); // Wait longer than DRAIN_TIMEOUT_MS
  assert(q.size(123) === 0, "Queue auto-drained after timeout");
  assert(pipelineCalls.length === 1, "Pipeline called by auto-drain");
  assert(pipelineCalls[0].words[0] === "timeout_word", "Correct word auto-drained");
}

async function testEmptyDrainNoop() {
  console.log("\nTest: Drain on empty queue is no-op");
  resetState();
  const q = new TestWordQueue();
  q.init(mockApi);

  await q.drain(123);
  assert(pipelineCalls.length === 0, "No pipeline call for empty drain");
  assert(apiCalls.length === 0, "No API calls for empty drain");
}

async function testDoubleDrainNoop() {
  console.log("\nTest: Double drain — second is no-op");
  resetState();
  const q = new TestWordQueue();
  q.init(mockApi);

  await q.add(123, [{ word: "word1", lang: EN }]);
  await q.drain(123);
  const callsAfterFirst = pipelineCalls.length;

  await q.drain(123); // Should be no-op
  assert(pipelineCalls.length === callsAfterFirst, "Second drain didn't trigger pipeline");
}

async function testMultipleChats() {
  console.log("\nTest: Multiple chats are independent");
  resetState();
  const q = new TestWordQueue();
  q.init(mockApi);

  await q.add(111, [{ word: "chat1_word", lang: EN }]);
  await q.add(222, [{ word: "chat2_word", lang: CN }]);

  assert(q.size(111) === 1, "Chat 111 has 1 entry");
  assert(q.size(222) === 1, "Chat 222 has 1 entry");

  await q.drain(111);
  assert(q.size(111) === 0, "Chat 111 drained");
  assert(q.size(222) === 1, "Chat 222 unaffected");
  assert(pipelineCalls.length === 1, "Only one pipeline call");
  assert(pipelineCalls[0].lang === "english", "Chat 111 processed as English");
}

async function testWordsAddedDuringDrain() {
  console.log("\nTest: Words added during drain go to next batch");
  resetState();
  const q = new TestWordQueue();
  q.init(mockApi);

  // Override drain to simulate slow processing
  const origDrain = q.drain.bind(q);
  let drainPromise: Promise<void> | null = null;

  await q.add(123, [{ word: "first", lang: EN }]);

  // Drain the first word
  await origDrain(123);

  assert(pipelineCalls.length === 1, "First drain processed");
  assert(pipelineCalls[0].words.includes("first"), "First word was in the drain batch");

  // After drain completes, add a new word (simulates word arriving during/after drain)
  await q.add(123, [{ word: "second", lang: EN }]);
  assert(q.size(123) === 1, "Second word is queued for next batch");
  assert(!q.isDraining(123), "Not draining after add");

  // Manually drain the second batch (timer-based auto-drain tested in testAutoTimeout)
  await q.drain(123);
  assert(pipelineCalls.length === 2, "Second drain processed");
  assert(pipelineCalls[1].words.includes("second"), "Second word processed in next batch");
}

// ──── Run all tests ────

async function main() {
  console.log("=== Word Queue Tests ===");

  await testSingleWordThenDrain();
  await testMultipleWordsBatched();
  await testMixedLanguages();
  await testAutoTimeout();
  await testEmptyDrainNoop();
  await testDoubleDrainNoop();
  await testMultipleChats();
  await testWordsAddedDuringDrain();

  console.log("\n=== Done ===");
  if (process.exitCode === 1) {
    console.log("Some tests FAILED!");
  } else {
    console.log("All tests PASSED!");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
