#!/usr/bin/env node

import { execSync, spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

// ANSI colors
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

// ── Load config ──────────────────────────────────────────────────────

function loadSecretsFile() {
  const secretsPath = join(ROOT, "data", "secrets.json");
  if (!existsSync(secretsPath)) return {};
  try {
    return JSON.parse(readFileSync(secretsPath, "utf-8"));
  } catch {
    return {};
  }
}

function getVal(key, secrets) {
  if (secrets[key]) return { value: secrets[key], source: "settings" };
  return { value: null, source: null };
}

// ── Anki check ───────────────────────────────────────────────────────

function checkAnki() {
  try {
    execSync("pgrep -ix anki", { stdio: "pipe" });
    return "running";
  } catch {
    return "not_running";
  }
}

function launchAnki() {
  try {
    execSync("open -a Anki", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log();

  // 1. Anki check
  const ankiStatus = checkAnki();
  let ankiLine;
  if (ankiStatus === "running") {
    ankiLine = green("Running");
  } else {
    const launched = launchAnki();
    if (launched) {
      ankiLine = green("Launched") + dim(" (was not running)");
      // Give Anki a moment to start
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      ankiLine = yellow("Not found") + dim(" — install Anki or start it manually");
    }
  }
  console.log(`  ${bold("Anki:")}          ${ankiLine}`);

  // 2. Config checks
  const secrets = loadSecretsFile();

  // AI Backend
  const anthropicKey = getVal("ANTHROPIC_API_KEY", secrets);
  const oauthToken = getVal("CLAUDE_CODE_OAUTH_TOKEN", secrets);
  const aiBackendSetting = getVal("AI_BACKEND", secrets);
  const backendMode = aiBackendSetting.value || "auto";

  let aiLine;
  if (backendMode === "sdk" || (backendMode === "auto" && anthropicKey.value)) {
    if (anthropicKey.value) {
      aiLine = green("SDK");
    } else {
      aiLine = red("SDK selected but no API key") + dim(" — go to /settings");
    }
  } else if (backendMode === "cli" || (backendMode === "auto" && oauthToken.value)) {
    if (oauthToken.value) {
      aiLine = green("CLI");
    } else {
      aiLine = red("CLI selected but no OAuth token") + dim(" — go to /settings");
    }
  } else {
    aiLine = red("Not configured") + dim(" — go to /settings to add an API key");
  }
  console.log(`  ${bold("AI Backend:")}    ${aiLine}`);

  // Azure TTS
  const azureKey = getVal("AZURE_TTS_KEY", secrets);
  let azureLine;
  if (azureKey.value) {
    azureLine = green("Configured");
  } else {
    azureLine = yellow("Not set") + dim(" — audio generation unavailable");
  }
  console.log(`  ${bold("Azure TTS:")}     ${azureLine}`);

  // Gemini / Nano Banana
  const geminiKey = getVal("NANO_BANANA_API_KEY", secrets);
  let geminiLine;
  if (geminiKey.value) {
    geminiLine = green("Configured");
  } else {
    geminiLine = yellow("Not set") + dim(" — image generation unavailable");
  }
  console.log(`  ${bold("Gemini:")}        ${geminiLine}`);

  // AnkiConnect URL (only key that supports env var — for Docker)
  const ankiUrl = getVal("ANKI_CONNECT_URL", secrets);
  const envAnkiUrl = process.env.ANKI_CONNECT_URL;
  const urlValue = ankiUrl.value || envAnkiUrl || "http://localhost:8765";
  const urlSource = ankiUrl.value ? "settings" : envAnkiUrl ? "env" : "default";
  console.log(`  ${bold("AnkiConnect:")}   ${dim(`${urlValue} (${urlSource})`)}`);

  console.log();
  console.log(`Starting ${bold("next dev")}...`);
  console.log();

  // 3. Start next dev, passing through all args after --
  // Unset CLAUDECODE so the CLI AI backend can spawn claude subprocess
  // (avoids "nested session" error when dev server is started from Claude Code)
  const env = { ...process.env };
  delete env.CLAUDECODE;

  const extraArgs = process.argv.slice(2);
  const child = spawn("npx", ["next", "dev", ...extraArgs], {
    stdio: "inherit",
    shell: true,
    env,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main();
