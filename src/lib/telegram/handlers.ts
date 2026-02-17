/**
 * Telegram message handlers.
 */
import type { Bot } from "grammy";
import { detectIntent } from "./intent";
import { createProgressReporter } from "./progress";
import {
  runFullPipeline,
  runFullPipelineFromExtraction,
  extractFromImages,
} from "@/lib/enrichment-pipeline";
import { ankiConnect } from "@/lib/anki-connect";

function formatResult(result: {
  created: number;
  duplicates: number;
  errors: string[];
}): string {
  const lines: string[] = [];
  lines.push(`<b>Done!</b>`);
  if (result.created > 0) lines.push(`Created: ${result.created} cards`);
  if (result.duplicates > 0) lines.push(`Duplicates skipped: ${result.duplicates}`);
  if (result.errors.length > 0) {
    lines.push(`\nErrors (${result.errors.length}):`);
    for (const err of result.errors.slice(0, 5)) {
      lines.push(`  - ${err}`);
    }
    if (result.errors.length > 5) {
      lines.push(`  ...and ${result.errors.length - 5} more`);
    }
  }
  if (result.created > 0 && result.errors.length === 0) {
    lines.push("\nAll cards fully enriched with text, audio, and images.");
  }
  return lines.join("\n");
}

const USAGE_TEXT =
  "Send me words to add to Anki:\n" +
  "- Single word or phrase\n" +
  "- Multiple words (one per line, or comma-separated)\n" +
  "- A photo of a spelling worksheet";

export function registerHandlers(bot: Bot): void {
  // Handle /start and /help commands
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Hi! I'm your Anki spelling bot.\n\n" + USAGE_TEXT,
      { parse_mode: "HTML" }
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(USAGE_TEXT, { parse_mode: "HTML" });
  });

  // Handle text messages
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const intent = detectIntent(text);

    if (intent.type === "unknown") {
      await ctx.reply(USAGE_TEXT, { parse_mode: "HTML" });
      return;
    }

    // Check Anki is reachable first
    const ankiOk = await ankiConnect.ping();
    if (!ankiOk) {
      await ctx.reply("Anki is not reachable. Make sure Anki is running with AnkiConnect.");
      return;
    }

    const progress = createProgressReporter(ctx);
    await progress.update(`Adding ${intent.words.length} word(s)...`);

    try {
      const result = await runFullPipeline(intent.words, progress);
      await progress.send(formatResult(result));
    } catch (err) {
      await ctx.reply(
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  // Handle photo messages (worksheet extraction)
  bot.on("message:photo", async (ctx) => {
    const ankiOk = await ankiConnect.ping();
    if (!ankiOk) {
      await ctx.reply("Anki is not reachable. Make sure Anki is running with AnkiConnect.");
      return;
    }

    const progress = createProgressReporter(ctx);
    await progress.update("Downloading photo...");

    try {
      // Get the largest photo version
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const file = await ctx.api.getFile(largest.file_id);

      if (!file.file_path) {
        await ctx.reply("Could not download the photo.");
        return;
      }

      // Download the file
      const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/` + file.file_path;
      const res = await fetch(fileUrl);
      if (!res.ok) {
        await ctx.reply("Failed to download photo from Telegram.");
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

      await progress.update("Extracting words from worksheet...");

      const pages = await extractFromImages([
        { base64, mediaType: mediaType as "image/jpeg" | "image/png" },
      ]);

      if (!pages || pages.length === 0) {
        await ctx.reply("Could not extract any words from the photo.");
        return;
      }

      const totalWords = pages.reduce(
        (sum, p) => sum + p.sentences.length,
        0
      );
      await progress.update(
        `Extracted ${totalWords} words from ${pages.length} page(s). Processing...`
      );

      const result = await runFullPipelineFromExtraction(pages, progress);
      await progress.send(formatResult(result));
    } catch (err) {
      await ctx.reply(
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}
