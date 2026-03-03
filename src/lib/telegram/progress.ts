/**
 * Telegram progress reporter.
 * Sends new messages for final results and edits in-place for progress updates.
 */
import type { Api, Context } from "grammy";
import type { PipelineProgress } from "@/lib/enrichment-pipeline";

export function createProgressReporter(ctx: Context): PipelineProgress {
  let progressMessageId: number | null = null;
  const chatId = ctx.chat!.id;

  return {
    async send(text: string) {
      await ctx.api.sendMessage(chatId, text, { parse_mode: "HTML" });
      progressMessageId = null;
    },

    async update(text: string) {
      try {
        if (progressMessageId) {
          await ctx.api.editMessageText(chatId, progressMessageId, text, {
            parse_mode: "HTML",
          });
        } else {
          const msg = await ctx.api.sendMessage(chatId, text, {
            parse_mode: "HTML",
          });
          progressMessageId = msg.message_id;
        }
      } catch {
        // Edit may fail if text unchanged — ignore
      }
    },
  };
}

/** Progress reporter that takes the Grammy Api directly (for async drain outside handlers). */
export function createApiProgressReporter(api: Api, chatId: number): PipelineProgress {
  let progressMessageId: number | null = null;

  return {
    async send(text: string) {
      await api.sendMessage(chatId, text, { parse_mode: "HTML" });
      progressMessageId = null;
    },

    async update(text: string) {
      try {
        if (progressMessageId) {
          await api.editMessageText(chatId, progressMessageId, text, {
            parse_mode: "HTML",
          });
        } else {
          const msg = await api.sendMessage(chatId, text, {
            parse_mode: "HTML",
          });
          progressMessageId = msg.message_id;
        }
      } catch {
        // Edit may fail if text unchanged — ignore
      }
    },
  };
}
