/**
 * Telegram bot singleton.
 * Uses globalThis to survive Next.js HMR in dev mode.
 */
import { Bot } from "grammy";
import { getConfig } from "@/lib/settings";
import { registerHandlers } from "./handlers";

// Persist across HMR in dev
const globalForBot = globalThis as unknown as {
  __telegramBot?: Bot;
  __telegramBotRunning?: boolean;
};

function getAllowedUserIds(): Set<number> {
  const raw = getConfig("TELEGRAM_ALLOWED_USERS");
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number)
      .filter((n) => !isNaN(n))
  );
}

export async function startTelegramBot(): Promise<void> {
  // Don't start twice
  if (globalForBot.__telegramBotRunning) {
    console.log("[Telegram] Bot already running");
    return;
  }

  const token = getConfig("TELEGRAM_BOT_TOKEN");
  if (!token) {
    console.log("[Telegram] No bot token configured — skipping");
    return;
  }

  // Stop previous bot instance if it exists (HMR case)
  if (globalForBot.__telegramBot) {
    try {
      globalForBot.__telegramBot.stop();
    } catch {
      // Ignore
    }
  }

  const bot = new Bot(token);

  // Access control middleware
  bot.use(async (ctx, next) => {
    const allowedUsers = getAllowedUserIds();
    if (allowedUsers.size === 0) {
      // No allowed users configured — accept all
      return next();
    }
    const userId = ctx.from?.id;
    if (userId && allowedUsers.has(userId)) {
      return next();
    }
    // Unauthorized
    if (ctx.message) {
      await ctx.reply("You are not authorized to use this bot.");
    }
  });

  registerHandlers(bot);

  // Error handler
  bot.catch((err) => {
    console.error("[Telegram] Bot error:", err.message);
  });

  globalForBot.__telegramBot = bot;
  globalForBot.__telegramBotRunning = true;

  // Start long-polling (non-blocking)
  bot.start({
    drop_pending_updates: true,
    onStart: () => {
      console.log("[Telegram] Bot started (long-polling)");
    },
  });

  // Handle graceful shutdown
  const onShutdown = () => {
    stopTelegramBot();
    process.exit(0);
  };
  process.once("SIGINT", onShutdown);
  process.once("SIGTERM", onShutdown);
}

export function stopTelegramBot(): void {
  if (globalForBot.__telegramBot) {
    try {
      globalForBot.__telegramBot.stop();
    } catch {
      // Ignore
    }
    globalForBot.__telegramBotRunning = false;
    console.log("[Telegram] Bot stopped");
  }
}
