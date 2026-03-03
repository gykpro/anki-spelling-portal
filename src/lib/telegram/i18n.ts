/**
 * Internationalisation for the Telegram bot.
 * Two locales (English / Chinese) with placeholder substitution.
 */
import { getUserLang, type Lang } from "./user-prefs";

export type MsgKey =
  | "not_authorized"
  | "usage_text"
  | "start_greeting"
  | "queue_empty_or_processing"
  | "queued_words_header"
  | "queue_edited"
  | "could_not_remove"
  | "removed_word"
  | "queue_is_empty"
  | "btn_start_now"
  | "btn_edit_queue"
  | "btn_done"
  | "anki_not_reachable"
  | "downloading"
  | "download_type_photo"
  | "download_type_pdf"
  | "download_type_image"
  | "could_not_download"
  | "failed_download"
  | "extracting_words"
  | "could_not_extract"
  | "queued_position"
  | "extracted_processing"
  | "error_message"
  | "result_done"
  | "result_language"
  | "result_deck"
  | "result_created"
  | "result_duplicates"
  | "result_errors_header"
  | "result_errors_detail"
  | "result_and_more"
  | "result_all_enriched"
  | "queue_waiting_first"
  | "queue_words_added"
  | "queue_waiting_more"
  | "queue_words_added_next"
  | "queue_processing"
  | "queue_adding"
  | "lang_choose"
  | "lang_updated"
  | "btn_lang_english"
  | "btn_lang_chinese";

const translations: Record<Lang, Record<MsgKey, string>> = {
  english: {
    not_authorized: "You are not authorized to use this bot.",
    usage_text:
      "Send me words to add to Anki:\n- Single word or phrase\n- Multiple words (one per line, or comma-separated)\n- A photo or PDF of a spelling worksheet",
    start_greeting: "Hi! I'm your Anki spelling bot.\n\n{0}",
    queue_empty_or_processing: "Queue is empty or processing",
    queued_words_header: "Queued words — tap to remove:",
    queue_edited: "Queue edited.",
    could_not_remove: "Could not remove (queue may have changed)",
    removed_word: "Removed: {0}",
    queue_is_empty: "Queue is empty.",
    btn_start_now: "Start Now",
    btn_edit_queue: "Edit Queue",
    btn_done: "Done",
    anki_not_reachable:
      "Anki is not reachable. Make sure Anki is running with AnkiConnect.",
    downloading: "Downloading {0}...",
    download_type_photo: "photo",
    download_type_pdf: "PDF",
    download_type_image: "image",
    could_not_download: "Could not download the {0}.",
    failed_download: "Failed to download {0} from Telegram.",
    extracting_words: "Extracting words from worksheet...",
    could_not_extract: "Could not extract any words from the {0}.",
    queued_position: "Queued (position {0})...",
    extracted_processing:
      "Extracted {0} words from {1} page(s). Processing...",
    error_message: "Error: {0}",
    result_done: "<b>Done!</b>",
    result_language: "Language: {0}",
    result_deck: "Deck: {0}",
    result_created: "Created: {0} cards",
    result_duplicates: "Duplicates skipped: {0}",
    result_errors_header: "Errors: {0}",
    result_errors_detail: "\nErrors ({0}):",
    result_and_more: "...and {0} more",
    result_all_enriched:
      "All cards fully enriched with text, audio, and images.",
    queue_waiting_first:
      "{0} word(s) queued. Waiting 1 min for more...",
    queue_words_added: "Words added ({0} queued)",
    queue_waiting_more: "{0} word(s) queued. Waiting for more...",
    queue_words_added_next: "Words added ({0} queued for next batch)",
    queue_processing: "Processing {0} word(s)...",
    queue_adding: "Adding {0} word(s) → {1} ({2})...",
    lang_choose: "Choose your preferred language for bot responses:",
    lang_updated: "Language set to {0}.",
    btn_lang_english: "English",
    btn_lang_chinese: "中文",
  },
  chinese: {
    not_authorized: "您无权使用此机器人。",
    usage_text:
      "发送单词以添加到 Anki：\n- 单个单词或短语\n- 多个单词（每行一个，或逗号分隔）\n- 拼写练习表的照片或 PDF",
    start_greeting: "你好！我是你的 Anki 拼写机器人。\n\n{0}",
    queue_empty_or_processing: "队列为空或正在处理",
    queued_words_header: "排队中的单词 — 点击移除：",
    queue_edited: "队列已编辑。",
    could_not_remove: "无法移除（队列可能已更改）",
    removed_word: "已移除：{0}",
    queue_is_empty: "队列为空。",
    btn_start_now: "立即开始",
    btn_edit_queue: "编辑队列",
    btn_done: "完成",
    anki_not_reachable:
      "无法连接到 Anki。请确保 Anki 正在运行且已安装 AnkiConnect。",
    downloading: "正在下载{0}...",
    download_type_photo: "照片",
    download_type_pdf: "PDF",
    download_type_image: "图片",
    could_not_download: "无法下载{0}。",
    failed_download: "从 Telegram 下载{0}失败。",
    extracting_words: "正在从练习表提取单词...",
    could_not_extract: "无法从{0}中提取任何单词。",
    queued_position: "已排队（第 {0} 位）...",
    extracted_processing:
      "从 {1} 页中提取了 {0} 个单词。正在处理...",
    error_message: "错误：{0}",
    result_done: "<b>完成！</b>",
    result_language: "语言：{0}",
    result_deck: "牌组：{0}",
    result_created: "已创建：{0} 张卡片",
    result_duplicates: "跳过重复：{0}",
    result_errors_header: "错误：{0}",
    result_errors_detail: "\n错误（{0}）：",
    result_and_more: "...还有 {0} 个",
    result_all_enriched: "所有卡片已完成文字、音频和图片。",
    queue_waiting_first:
      "已排队 {0} 个单词，等待 1 分钟收集更多...",
    queue_words_added: "已添加单词（共 {0} 个排队中）",
    queue_waiting_more: "{0} 个单词排队中，等待更多...",
    queue_words_added_next: "已添加单词（{0} 个等待下一批处理）",
    queue_processing: "正在处理 {0} 个单词...",
    queue_adding: "正在添加 {0} 个单词 → {1}（{2}）...",
    lang_choose: "选择机器人回复的语言：",
    lang_updated: "语言已设置为{0}。",
    btn_lang_english: "English",
    btn_lang_chinese: "中文",
  },
};

/**
 * Translate a message key for a given user.
 * Placeholder substitution: {0}, {1}, etc. replaced by positional args.
 */
export function t(userId: number, key: MsgKey, ...args: (string | number)[]): string {
  const lang = getUserLang(userId);
  let msg = translations[lang][key];
  for (let i = 0; i < args.length; i++) {
    msg = msg.replaceAll(`{${i}}`, String(args[i]));
  }
  return msg;
}
