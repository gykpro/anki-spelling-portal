/**
 * Per-user preferences for the Telegram bot.
 * File-based persistence with in-memory cache (same pattern as settings.ts).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export type Lang = "english" | "chinese";

interface UserPref {
  lang: Lang;
}

type UserPrefs = Record<string, UserPref>;

const DATA_DIR = join(process.cwd(), "data");
const PREFS_FILE = join(DATA_DIR, "telegram-user-prefs.json");

let cache: UserPrefs | null = null;

function readPrefs(): UserPrefs {
  if (cache) return cache;
  try {
    if (existsSync(PREFS_FILE)) {
      const raw = readFileSync(PREFS_FILE, "utf-8");
      cache = JSON.parse(raw);
      return cache!;
    }
  } catch {
    // Corrupted file — treat as empty
  }
  cache = {};
  return cache;
}

function writePrefs(data: UserPrefs): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(PREFS_FILE, JSON.stringify(data, null, 2), "utf-8");
  cache = data;
}

export function getUserLang(userId: number): Lang {
  const prefs = readPrefs();
  return prefs[String(userId)]?.lang ?? "english";
}

export function setUserLang(userId: number, lang: Lang): void {
  const prefs = readPrefs();
  prefs[String(userId)] = { lang };
  writePrefs(prefs);
}

/** Return all known user/chat IDs (for broadcast messages). */
export function getAllChatIds(): number[] {
  const prefs = readPrefs();
  return Object.keys(prefs).map(Number).filter((n) => !isNaN(n));
}
