/**
 * Telegram message handlers.
 */
import type { Bot } from "grammy";
import { detectIntent } from "./intent";
import { createProgressReporter } from "./progress";
import {
  runFullPipelineFromExtraction,
  extractFromImages,
} from "@/lib/enrichment-pipeline";
import { ankiConnect } from "@/lib/anki-connect";
import { writeQueue } from "@/lib/write-queue";
import { wordQueue, type QueueEntry } from "./word-queue";
import { t } from "./i18n";
import { setUserLang } from "./user-prefs";

function getUid(ctx: { from?: { id: number }; chat?: { id: number } }): number {
  return ctx.from?.id ?? ctx.chat?.id ?? 0;
}

function formatResult(
  userId: number,
  result: {
    created: number;
    duplicates: number;
    errors: string[];
    deck?: string;
    lang?: string;
  }
): string {
  const lines: string[] = [];
  lines.push(t(userId, "result_done"));
  if (result.lang) lines.push(t(userId, "result_language", result.lang));
  if (result.deck) lines.push(t(userId, "result_deck", result.deck));
  if (result.created > 0) lines.push(t(userId, "result_created", result.created));
  if (result.duplicates > 0) lines.push(t(userId, "result_duplicates", result.duplicates));
  if (result.errors.length > 0) {
    lines.push(t(userId, "result_errors_detail", result.errors.length));
    for (const err of result.errors.slice(0, 5)) {
      lines.push(`  - ${err}`);
    }
    if (result.errors.length > 5) {
      lines.push(`  ${t(userId, "result_and_more", result.errors.length - 5)}`);
    }
  }
  if (result.created > 0 && result.errors.length === 0) {
    lines.push("\n" + t(userId, "result_all_enriched"));
  }
  return lines.join("\n");
}

export function registerHandlers(bot: Bot): void {
  // Handle /start command
  bot.command("start", async (ctx) => {
    const uid = getUid(ctx);
    await ctx.reply(
      t(uid, "start_greeting", t(uid, "usage_text")),
      { parse_mode: "HTML" }
    );
  });

  // Handle /help command
  bot.command("help", async (ctx) => {
    const uid = getUid(ctx);
    await ctx.reply(t(uid, "usage_text"), { parse_mode: "HTML" });
  });

  // Handle /lang command — show language picker
  bot.command("lang", async (ctx) => {
    const uid = getUid(ctx);
    await ctx.reply(t(uid, "lang_choose"), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: t(uid, "btn_lang_english"), callback_data: "lang_set_english" },
            { text: t(uid, "btn_lang_chinese"), callback_data: "lang_set_chinese" },
          ],
        ],
      },
    });
  });

  // Handle language selection callbacks
  bot.callbackQuery("lang_set_english", async (ctx) => {
    const uid = getUid(ctx);
    setUserLang(uid, "english");
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(t(uid, "lang_updated", "English"), {
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      // ignore
    }
  });

  bot.callbackQuery("lang_set_chinese", async (ctx) => {
    const uid = getUid(ctx);
    setUserLang(uid, "chinese");
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(t(uid, "lang_updated", "中文"), {
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      // ignore
    }
  });

  // Handle "Start Now" inline button
  bot.callbackQuery("word_queue_start", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (chatId) {
      await wordQueue.drain(chatId);
    }
  });

  // Handle "Edit Queue" inline button
  bot.callbackQuery("word_queue_edit", async (ctx) => {
    const chatId = ctx.chat?.id;
    const uid = getUid(ctx);
    if (!chatId) {
      await ctx.answerCallbackQuery();
      return;
    }

    const entries = wordQueue.getEntries(chatId);
    if (entries.length === 0 || wordQueue.isDraining(chatId)) {
      await ctx.answerCallbackQuery(t(uid, "queue_empty_or_processing"));
      return;
    }

    await ctx.answerCallbackQuery();

    const keyboard = entries.map((e, i) => [
      { text: `❌ ${e.word} (${e.lang.label})`, callback_data: `word_queue_rm_${i}` },
    ]);
    keyboard.push([{ text: t(uid, "btn_done"), callback_data: "word_queue_edit_done" }]);

    await ctx.reply(t(uid, "queued_words_header"), {
      reply_markup: { inline_keyboard: keyboard },
    });
  });

  // Handle "Done" on edit queue message
  bot.callbackQuery("word_queue_edit_done", async (ctx) => {
    const uid = getUid(ctx);
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(t(uid, "queue_edited"), {
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      // ignore
    }
  });

  // Handle word removal from queue
  bot.callbackQuery(/^word_queue_rm_(\d+)$/, async (ctx) => {
    const chatId = ctx.chat?.id;
    const uid = getUid(ctx);
    if (!chatId) {
      await ctx.answerCallbackQuery();
      return;
    }

    const index = parseInt(ctx.match[1], 10);
    const removed = wordQueue.remove(chatId, index);

    if (!removed) {
      await ctx.answerCallbackQuery(t(uid, "could_not_remove"));
      return;
    }

    await ctx.answerCallbackQuery(t(uid, "removed_word", removed.word));

    // Rebuild the edit message with updated entries
    const entries = wordQueue.getEntries(chatId);
    if (entries.length === 0) {
      try {
        await ctx.editMessageText(t(uid, "queue_is_empty"), {
          reply_markup: { inline_keyboard: [] },
        });
      } catch {
        // ignore
      }
    } else {
      const keyboard = entries.map((e, i) => [
        { text: `❌ ${e.word} (${e.lang.label})`, callback_data: `word_queue_rm_${i}` },
      ]);
      keyboard.push([{ text: t(uid, "btn_done"), callback_data: "word_queue_edit_done" }]);

      try {
        await ctx.editMessageText(t(uid, "queued_words_header"), {
          reply_markup: { inline_keyboard: keyboard },
        });
      } catch {
        // ignore
      }

      // Update the status message count
      await wordQueue.updateStatusMessage(chatId);
    }
  });

  // Handle text messages — push to word queue instead of immediate pipeline
  bot.on("message:text", async (ctx) => {
    const uid = getUid(ctx);
    const text = ctx.message.text;
    const intent = detectIntent(text);

    if (intent.type === "unknown") {
      await ctx.reply(t(uid, "usage_text"), { parse_mode: "HTML" });
      return;
    }

    // Check Anki is reachable first
    const ankiOk = await ankiConnect.ping();
    if (!ankiOk) {
      await ctx.reply(t(uid, "anki_not_reachable"));
      return;
    }

    // Convert intent words to queue entries
    const entries: QueueEntry[] = intent.words.map((word) => ({
      word,
      lang: intent.lang,
    }));

    await wordQueue.add(ctx.chat.id, entries);
  });

  // Handle photo messages (worksheet extraction)
  bot.on("message:photo", async (ctx) => {
    const uid = getUid(ctx);

    const ankiOk = await ankiConnect.ping();
    if (!ankiOk) {
      await ctx.reply(t(uid, "anki_not_reachable"));
      return;
    }

    // Drain pending words first before processing photo
    if (wordQueue.size(ctx.chat.id) > 0) {
      await wordQueue.drain(ctx.chat.id);
    }

    const progress = createProgressReporter(ctx);
    await progress.update(t(uid, "downloading", t(uid, "download_type_photo")));

    try {
      // Get the largest photo version
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const file = await ctx.api.getFile(largest.file_id);

      if (!file.file_path) {
        await ctx.reply(t(uid, "could_not_download", t(uid, "download_type_photo")));
        return;
      }

      // Download the file
      const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/` + file.file_path;
      const res = await fetch(fileUrl);
      if (!res.ok) {
        await ctx.reply(t(uid, "failed_download", t(uid, "download_type_photo")));
        return;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const base64 = buffer.toString("base64");
      const ext = file.file_path.split(".").pop()?.toLowerCase();
      const mediaType =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "png"
            ? "image/png"
            : "image/jpeg";

      await progress.update(t(uid, "extracting_words"));

      const pages = await extractFromImages([
        { base64, mediaType: mediaType as "image/jpeg" | "image/png" },
      ]);

      if (!pages || pages.length === 0) {
        await ctx.reply(t(uid, "could_not_extract", t(uid, "download_type_photo")));
        return;
      }

      const totalWords = pages.reduce(
        (sum, p) => sum + p.sentences.length,
        0
      );

      if (writeQueue.pending > 0) {
        await progress.update(t(uid, "queued_position", writeQueue.pending));
      }

      const result = await writeQueue.enqueue(async () => {
        await progress.update(
          t(uid, "extracted_processing", totalWords, pages.length)
        );
        return runFullPipelineFromExtraction(pages, progress);
      });
      await progress.send(formatResult(uid, result));
    } catch (err) {
      await ctx.reply(
        t(uid, "error_message", err instanceof Error ? err.message : String(err))
      );
    }
  });

  // Handle document messages (PDFs and images sent as files)
  bot.on("message:document", async (ctx) => {
    const uid = getUid(ctx);
    const doc = ctx.message.document;
    const mime = doc.mime_type ?? "";

    // Only handle images and PDFs
    const isImage = mime.startsWith("image/");
    const isPdf = mime === "application/pdf";
    if (!isImage && !isPdf) {
      await ctx.reply(t(uid, "usage_text"), { parse_mode: "HTML" });
      return;
    }

    const ankiOk = await ankiConnect.ping();
    if (!ankiOk) {
      await ctx.reply(t(uid, "anki_not_reachable"));
      return;
    }

    // Drain pending words first before processing document
    if (wordQueue.size(ctx.chat.id) > 0) {
      await wordQueue.drain(ctx.chat.id);
    }

    const fileType = isPdf ? "download_type_pdf" : "download_type_image" as const;
    const progress = createProgressReporter(ctx);
    await progress.update(t(uid, "downloading", t(uid, fileType)));

    try {
      const file = await ctx.api.getFile(doc.file_id);
      if (!file.file_path) {
        await ctx.reply(t(uid, "could_not_download", t(uid, fileType)));
        return;
      }

      const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/` + file.file_path;
      const res = await fetch(fileUrl);
      if (!res.ok) {
        await ctx.reply(t(uid, "failed_download", t(uid, fileType)));
        return;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const base64 = buffer.toString("base64");

      let mediaType: "image/jpeg" | "image/png" | "application/pdf";
      if (isPdf) {
        mediaType = "application/pdf";
      } else {
        const ext = file.file_path.split(".").pop()?.toLowerCase();
        mediaType = ext === "png" ? "image/png" : "image/jpeg";
      }

      await progress.update(t(uid, "extracting_words"));

      const pages = await extractFromImages([{ base64, mediaType }]);

      if (!pages || pages.length === 0) {
        await ctx.reply(t(uid, "could_not_extract", t(uid, fileType)));
        return;
      }

      const totalWords = pages.reduce(
        (sum, p) => sum + p.sentences.length,
        0
      );

      if (writeQueue.pending > 0) {
        await progress.update(t(uid, "queued_position", writeQueue.pending));
      }

      const result = await writeQueue.enqueue(async () => {
        await progress.update(
          t(uid, "extracted_processing", totalWords, pages.length)
        );
        return runFullPipelineFromExtraction(pages, progress);
      });
      await progress.send(formatResult(uid, result));
    } catch (err) {
      await ctx.reply(
        t(uid, "error_message", err instanceof Error ? err.message : String(err))
      );
    }
  });
}
