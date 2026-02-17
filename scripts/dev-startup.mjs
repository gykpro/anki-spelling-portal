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

// ── Load config sources ──────────────────────────────────────────────

function loadEnvFile() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return {};
  const vars = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (val) vars[key] = val;
  }
  return vars;
}

function loadSecretsFile() {
  const secretsPath = join(ROOT, "data", "secrets.json");
  if (!existsSync(secretsPath)) return {};
  try {
    return JSON.parse(readFileSync(secretsPath, "utf-8"));
  } catch {
    return {};
  }
}

function getVal(key, secrets, env) {
  if (secrets[key]) return { value: secrets[key], source: "settings" };
  if (env[key]) return { value: env[key], source: "env" };
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
  const env = loadEnvFile();

  // AI Backend
  const anthropicKey = getVal("ANTHROPIC_API_KEY", secrets, env);
  const oauthToken = getVal("CLAUDE_CODE_OAUTH_TOKEN", secrets, env);
  const aiBackendSetting = getVal("AI_BACKEND", secrets, env);
  const backendMode = aiBackendSetting.value || "auto";

  let aiLine;
  if (backendMode === "sdk" || (backendMode === "auto" && anthropicKey.value)) {
    if (anthropicKey.value) {
      aiLine = green("SDK") + dim(` (from ${anthropicKey.source})`);
    } else {
      aiLine = red("SDK selected but no API key") + dim(" — go to /settings");
    }
  } else if (backendMode === "cli" || (backendMode === "auto" && oauthToken.value)) {
    if (oauthToken.value) {
      aiLine = green("CLI") + dim(` (from ${oauthToken.source})`);
    } else {
      aiLine = red("CLI selected but no OAuth token") + dim(" — go to /settings");
    }
  } else {
    aiLine = red("Not configured") + dim(" — go to /settings to add an API key");
  }
  console.log(`  ${bold("AI Backend:")}    ${aiLine}`);

  // Azure TTS
  const azureKey = getVal("AZURE_TTS_KEY", secrets, env);
  const azureRegion = getVal("AZURE_TTS_REGION", secrets, env);
  let azureLine;
  if (azureKey.value) {
    azureLine = green("Configured") + dim(` (from ${azureKey.source})`);
  } else {
    azureLine = yellow("Not set") + dim(" — audio generation unavailable");
  }
  console.log(`  ${bold("Azure TTS:")}     ${azureLine}`);

  // Gemini / Nano Banana
  const geminiKey = getVal("NANO_BANANA_API_KEY", secrets, env);
  let geminiLine;
  if (geminiKey.value) {
    geminiLine = green("Configured") + dim(` (from ${geminiKey.source})`);
  } else {
    geminiLine = yellow("Not set") + dim(" — image generation unavailable");
  }
  console.log(`  ${bold("Gemini:")}        ${geminiLine}`);

  // AnkiConnect URL
  const ankiUrl = getVal("ANKI_CONNECT_URL", secrets, env);
  const urlValue = ankiUrl.value || "http://localhost:8765";
  const urlSource = ankiUrl.source || "default";
  console.log(`  ${bold("AnkiConnect:")}   ${dim(`${urlValue} (${urlSource})`)}`);

  console.log();
  console.log(`Starting ${bold("next dev")}...`);
  console.log();

  // 3. Start next dev, passing through all args after --
  const extraArgs = process.argv.slice(2);
  const child = spawn("npx", ["next", "dev", ...extraArgs], {
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main();
