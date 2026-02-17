export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelegramBot } = await import("@/lib/telegram/bot");
    // Small delay to let Next.js fully initialize
    setTimeout(() => startTelegramBot().catch(console.error), 2000);
  }
}
