/**
 * Word-level queue for Telegram bot.
 * Accumulates words per chat and batch-processes them after a timeout
 * or when the user clicks "Start Now".
 *
 * Sits above the write queue (which serializes AnkiConnect operations).
 * Singleton via globalThis to survive HMR.
 */
import type { Api } from "grammy";
import type { LanguageConfig } from "@/lib/languages";
import { writeQueue } from "@/lib/write-queue";
import { runFullPipeline } from "@/lib/enrichment-pipeline";
import { createApiProgressReporter } from "./progress";

export interface QueueEntry {
  word: string;
  lang: LanguageConfig;
}

interface ChatQueue {
  entries: QueueEntry[];
  timer: ReturnType<typeof setTimeout> | null;
  statusMessageId: number | null;
  draining: boolean;
}

const DRAIN_TIMEOUT_MS = 60_000; // 1 minute
const MAX_PIPELINE_WORDS = 50;

class WordQueue {
  private queues = new Map<number, ChatQueue>();
  private api: Api | null = null;

  init(api: Api): void {
    this.api = api;
  }

  private buildStatusKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: "Start Now", callback_data: "word_queue_start" },
          { text: "Edit Queue", callback_data: "word_queue_edit" },
        ],
      ],
    };
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

  /** Push words into the queue for a chat. Manages timer and status message. */
  async add(chatId: number, entries: QueueEntry[]): Promise<void> {
    if (!this.api) throw new Error("WordQueue not initialized — call init() first");
    const q = this.getOrCreate(chatId);
    const wasEmpty = q.entries.length === 0;

    q.entries.push(...entries);

    // Enforce max batch size
    if (q.entries.length >= MAX_PIPELINE_WORDS) {
      // Don't await — fire and forget so the handler returns quickly
      this.drain(chatId);
      return;
    }

    if (wasEmpty && !q.draining) {
      // First word(s) in a fresh queue — send status message with Start Now button
      q.timer = setTimeout(() => this.drain(chatId), DRAIN_TIMEOUT_MS);
      try {
        const msg = await this.api.sendMessage(
          chatId,
          `${q.entries.length} word(s) queued. Waiting 1 min for more...`,
          {
            parse_mode: "HTML",
            reply_markup: this.buildStatusKeyboard(),
          }
        );
        q.statusMessageId = msg.message_id;
      } catch {
        // Non-critical — the queue still works without the status message
      }
    } else if (!q.draining) {
      // Additional words — update status message
      try {
        await this.api.sendMessage(chatId, `Words added (${q.entries.length} queued)`);
      } catch {
        // ignore
      }
      // Update the original status message count
      if (q.statusMessageId) {
        try {
          await this.api.editMessageText(
            chatId,
            q.statusMessageId,
            `${q.entries.length} word(s) queued. Waiting for more...`,
            {
              reply_markup: this.buildStatusKeyboard(),
            }
          );
        } catch {
          // Edit may fail if text unchanged
        }
      }
    } else {
      // Draining in progress — just confirm the word was queued for next batch
      try {
        await this.api.sendMessage(
          chatId,
          `Words added (${q.entries.length} queued for next batch)`
        );
      } catch {
        // ignore
      }
    }
  }

  /** Force-drain: process all queued words immediately. */
  async drain(chatId: number): Promise<void> {
    if (!this.api) return;
    const q = this.queues.get(chatId);
    if (!q || q.entries.length === 0 || q.draining) return;

    // 1. Set draining, cancel timer
    q.draining = true;
    if (q.timer) {
      clearTimeout(q.timer);
      q.timer = null;
    }

    // 2. Snapshot entries and clear queue (new words go to next batch)
    const entries = [...q.entries];
    q.entries = [];

    // 3. Edit status message — remove keyboard, show processing
    if (q.statusMessageId) {
      try {
        await this.api.editMessageText(
          chatId,
          q.statusMessageId,
          `Processing ${entries.length} word(s)...`,
          { reply_markup: { inline_keyboard: [] } }
        );
      } catch {
        // ignore
      }
      q.statusMessageId = null;
    }

    // 4. Group entries by language
    const groups = new Map<string, { lang: LanguageConfig; words: string[] }>();
    for (const entry of entries) {
      const key = entry.lang.id;
      let group = groups.get(key);
      if (!group) {
        group = { lang: entry.lang, words: [] };
        groups.set(key, group);
      }
      group.words.push(entry.word);
    }

    // 5. Process each language group through the write queue
    const progress = createApiProgressReporter(this.api, chatId);
    const allResults: { lang: string; created: number; duplicates: number; errors: string[] }[] = [];

    for (const [, group] of groups) {
      try {
        const result = await writeQueue.enqueue(async () => {
          await progress.update(
            `Adding ${group.words.length} word(s) → ${group.lang.label} (${group.lang.deck})...`
          );
          return runFullPipeline(group.words, progress, group.lang);
        });
        allResults.push({ lang: group.lang.label, ...result });
      } catch (err) {
        allResults.push({
          lang: group.lang.label,
          created: 0,
          duplicates: 0,
          errors: [err instanceof Error ? err.message : String(err)],
        });
      }
    }

    // 6. Send combined summary
    const summaryLines: string[] = ["<b>Done!</b>"];
    for (const r of allResults) {
      const parts: string[] = [];
      if (allResults.length > 1) parts.push(`<b>${r.lang}</b>`);
      if (r.created > 0) parts.push(`Created: ${r.created} cards`);
      if (r.duplicates > 0) parts.push(`Duplicates skipped: ${r.duplicates}`);
      if (r.errors.length > 0) {
        parts.push(`Errors: ${r.errors.length}`);
        for (const e of r.errors.slice(0, 3)) parts.push(`  - ${e}`);
      }
      if (r.created > 0 && r.errors.length === 0) {
        parts.push("All cards fully enriched with text, audio, and images.");
      }
      summaryLines.push(parts.join("\n"));
    }
    try {
      await progress.send(summaryLines.join("\n"));
    } catch {
      // ignore
    }

    // 7. Done draining
    q.draining = false;

    // If new words accumulated during drain, start a new timer
    if (q.entries.length > 0) {
      q.timer = setTimeout(() => this.drain(chatId), DRAIN_TIMEOUT_MS);
      try {
        const msg = await this.api.sendMessage(
          chatId,
          `${q.entries.length} word(s) queued. Waiting 1 min for more...`,
          {
            parse_mode: "HTML",
            reply_markup: this.buildStatusKeyboard(),
          }
        );
        q.statusMessageId = msg.message_id;
      } catch {
        // ignore
      }
    }
  }

  /** Returns a snapshot of current pending entries. */
  getEntries(chatId: number): QueueEntry[] {
    const q = this.queues.get(chatId);
    if (!q) return [];
    return [...q.entries];
  }

  /** Remove entry at given index. Returns removed entry or null if invalid. */
  remove(chatId: number, index: number): QueueEntry | null {
    if (!this.api) return null;
    const q = this.queues.get(chatId);
    if (!q || q.draining || index < 0 || index >= q.entries.length) return null;

    const [removed] = q.entries.splice(index, 1);

    if (q.entries.length === 0) {
      // Queue empty — cancel timer, delete status message
      if (q.timer) {
        clearTimeout(q.timer);
        q.timer = null;
      }
      if (q.statusMessageId) {
        this.api
          .deleteMessage(chatId, q.statusMessageId)
          .catch(() => {});
        q.statusMessageId = null;
      }
    }

    return removed;
  }

  /** Update the status message with current count and keyboard. */
  async updateStatusMessage(chatId: number): Promise<void> {
    if (!this.api) return;
    const q = this.queues.get(chatId);
    if (!q || !q.statusMessageId) return;

    if (q.entries.length === 0) return;

    try {
      await this.api.editMessageText(
        chatId,
        q.statusMessageId,
        `${q.entries.length} word(s) queued. Waiting for more...`,
        { reply_markup: this.buildStatusKeyboard() }
      );
    } catch {
      // Edit may fail if text unchanged
    }
  }
}

// Singleton via globalThis (HMR-safe)
const GLOBAL_KEY = "__wordQueue" as const;

function getWordQueue(): WordQueue {
  const g = globalThis as unknown as Record<string, WordQueue>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new WordQueue();
  }
  return g[GLOBAL_KEY];
}

export const wordQueue = getWordQueue();
