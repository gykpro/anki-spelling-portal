import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const SECRETS_FILE = join(DATA_DIR, "secrets.json");

/** All managed config keys and their metadata */
const CONFIG_KEYS = {
  ANTHROPIC_API_KEY: { secret: true, envAllowed: false, description: "Anthropic API key (SDK mode)" },
  CLAUDE_CODE_OAUTH_TOKEN: { secret: true, envAllowed: false, description: "Claude Max OAuth token (CLI mode)" },
  AZURE_TTS_KEY: { secret: true, envAllowed: false, description: "Azure TTS subscription key" },
  AZURE_TTS_REGION: { secret: false, envAllowed: false, description: "Azure TTS region", default: "australiaeast" },
  NANO_BANANA_API_KEY: { secret: true, envAllowed: false, description: "Gemini API key for image generation" },
  ANKI_CONNECT_URL: { secret: false, envAllowed: true, description: "AnkiConnect URL", default: "http://localhost:8765" },
  AI_BACKEND: { secret: false, envAllowed: false, description: "AI backend: auto, sdk, or cli", default: "auto" },
  TELEGRAM_BOT_TOKEN: { secret: true, envAllowed: false, description: "Telegram Bot API token from @BotFather" },
  TELEGRAM_ALLOWED_USERS: { secret: false, envAllowed: false, description: "Comma-separated Telegram user IDs allowed to use the bot" },
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;

interface StoredSettings {
  [key: string]: string;
}

interface ConfigStatus {
  configured: boolean;
  source: "file" | "env" | "default" | "none";
  maskedValue: string | null;
  secret: boolean;
  description: string;
}

// Module-level cache
let cache: StoredSettings | null = null;

function readFile(): StoredSettings {
  if (cache) return cache;
  try {
    if (existsSync(SECRETS_FILE)) {
      const raw = readFileSync(SECRETS_FILE, "utf-8");
      cache = JSON.parse(raw);
      return cache!;
    }
  } catch {
    // Corrupted file — treat as empty
  }
  cache = {};
  return cache;
}

function writeFile(data: StoredSettings): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(SECRETS_FILE, JSON.stringify(data, null, 2), "utf-8");
  try {
    chmodSync(SECRETS_FILE, 0o600);
  } catch {
    // chmod may fail on some platforms (Windows) — ignore
  }
  cache = data;
}

function maskValue(value: string, isSecret: boolean): string {
  if (!isSecret) return value;
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "..." + value.slice(-4);
}

/** Get a single config value. Priority: file > env (if allowed) > default */
export function getConfig(key: ConfigKey): string {
  const stored = readFile();
  if (stored[key]) return stored[key];
  const meta = CONFIG_KEYS[key];
  if (meta.envAllowed) {
    const envVal = process.env[key];
    if (envVal) return envVal;
  }
  if ("default" in meta && meta.default) return meta.default;
  return "";
}

/** Get masked status of all config keys for the settings UI */
export function getAllConfigStatus(): Record<ConfigKey, ConfigStatus> {
  const stored = readFile();
  const result = {} as Record<ConfigKey, ConfigStatus>;

  for (const [key, meta] of Object.entries(CONFIG_KEYS)) {
    const k = key as ConfigKey;
    const fileVal = stored[k];
    const envVal = meta.envAllowed ? process.env[k] : undefined;
    const defaultVal = "default" in meta ? meta.default : undefined;

    let source: ConfigStatus["source"] = "none";
    let value: string | undefined;

    if (fileVal) {
      source = "file";
      value = fileVal;
    } else if (envVal) {
      source = "env";
      value = envVal;
    } else if (defaultVal) {
      source = "default";
      value = defaultVal;
    }

    result[k] = {
      configured: !!value,
      source,
      maskedValue: value ? maskValue(value, meta.secret) : null,
      secret: meta.secret,
      description: meta.description,
    };
  }

  return result;
}

/** Save settings updates. Empty string = delete key from file. */
export function saveSettings(updates: Partial<Record<ConfigKey, string>>): void {
  const stored = readFile();
  const newData = { ...stored };

  for (const [key, value] of Object.entries(updates)) {
    if (value === "" || value === undefined) {
      delete newData[key];
    } else {
      newData[key] = value;
    }
  }

  writeFile(newData);
}

/** Get the resolved AI backend mode */
export function getAIBackend(): "sdk" | "cli" | "none" {
  const setting = getConfig("AI_BACKEND");

  if (setting === "sdk") {
    return getConfig("ANTHROPIC_API_KEY") ? "sdk" : "none";
  }
  if (setting === "cli") {
    return getConfig("CLAUDE_CODE_OAUTH_TOKEN") ? "cli" : "none";
  }

  // Auto mode: prefer SDK, fallback to CLI
  if (getConfig("ANTHROPIC_API_KEY")) return "sdk";
  if (getConfig("CLAUDE_CODE_OAUTH_TOKEN")) return "cli";
  return "none";
}
