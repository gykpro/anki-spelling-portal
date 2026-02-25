#!/usr/bin/env node
/**
 * Extract words from spelling worksheet photos.
 * Optionally creates notes and runs full enrichment.
 *
 * Usage:
 *   node extract-worksheet.mjs --images /path/to/page1.jpg,/path/to/page2.jpg
 *   node extract-worksheet.mjs --images /path/to/page1.jpg --enrich
 */

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { checkHealth, postFormData } from "./lib/api.mjs";
import { checkDuplicates, createNotes, resolveWordsToNotes } from "./lib/anki-fields.mjs";
import { resolveLanguage } from "./lib/lang-config.mjs";

const { values } = parseArgs({
  options: {
    images: { type: "string" },
    enrich: { type: "boolean", default: false },
    lang: { type: "string" },
  },
  strict: false,
});

function getMediaType(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

async function main() {
  await checkHealth();

  if (!values.images) {
    process.stderr.write("Error: provide --images with comma-separated file paths\n");
    process.exit(2);
  }

  const imagePaths = values.images.split(",").map((p) => p.trim()).filter(Boolean);
  process.stderr.write(`Extracting from ${imagePaths.length} image(s)\n`);

  // Build FormData with file blobs
  const formData = new FormData();
  for (const imgPath of imagePaths) {
    try {
      const buffer = readFileSync(imgPath);
      const name = basename(imgPath);
      const blob = new Blob([buffer], { type: getMediaType(name) });
      formData.append("files", blob, name);
    } catch (err) {
      process.stderr.write(`Error reading "${imgPath}": ${err.message}\n`);
      process.exit(2);
    }
  }

  const extractResult = await postFormData("/api/extract", formData);
  const pages = extractResult.pages || [];

  if (pages.length === 0) {
    process.stderr.write("No pages extracted\n");
    process.stdout.write(JSON.stringify({ pages: [] }) + "\n");
    process.exit(0);
  }

  // Print extraction results
  for (const page of pages) {
    process.stderr.write(`\n  Page: ${page.termWeek || "unknown"} — ${page.topic || "no topic"}\n`);
    for (const item of page.sentences || []) {
      process.stderr.write(`    ${item.word}: ${item.sentence}\n`);
    }
  }

  if (!values.enrich) {
    // Just output the extracted data
    process.stdout.write(JSON.stringify({ pages }, null, 2) + "\n");
    process.exit(0);
  }

  // --enrich: create notes and run full enrichment
  process.stderr.write("\n=== Creating notes and enriching ===\n");

  const allWords = pages.flatMap((p) => (p.sentences || []).map((s) => s.word));
  const lang = resolveLanguage(values.lang, allWords[0]);
  const dupCheck = await checkDuplicates(allWords, lang);

  if (dupCheck.duplicates.length > 0) {
    process.stderr.write(`  Already exist: ${dupCheck.duplicates.join(", ")}\n`);
  }

  if (dupCheck.newWords.length > 0) {
    process.stderr.write(`  Creating: ${dupCheck.newWords.join(", ")}\n`);
    await createNotes(dupCheck.newWords, lang);
  }

  // Run the full enrichment pipeline via child process
  const { execFileSync } = await import("node:child_process");
  const { dirname, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const enrichScript = resolve(__dirname, "enrich-full.mjs");

  const args = [enrichScript, "--words", allWords.join(",")];
  if (lang.id !== "english") {
    args.push("--lang", lang.id);
  }

  try {
    const output = execFileSync("node", args, {
      encoding: "utf-8",
      stdio: ["inherit", "pipe", "inherit"],
      timeout: 600000, // 10 minutes
    });
    process.stdout.write(output);
  } catch (err) {
    process.stderr.write(`Enrichment subprocess failed: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(2);
});
