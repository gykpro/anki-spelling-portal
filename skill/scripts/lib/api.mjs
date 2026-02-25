/**
 * Shared HTTP client for the Anki enrichment portal API.
 * Reads config.json from the skill directory root.
 * No external dependencies — uses Node.js built-in fetch (18+).
 *
 * Resolution order: process.env.ANKI_PORTAL_URL → config.json → fallback localhost:3000
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "../../config.json");

function getApiUrl() {
  if (process.env.ANKI_PORTAL_URL) {
    return process.env.ANKI_PORTAL_URL.replace(/\/+$/, "");
  }
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    if (config.apiUrl) return config.apiUrl.replace(/\/+$/, "");
  } catch {
    // Config file missing or invalid — fall through to default
  }
  return "http://localhost:3000";
}

const API_URL = getApiUrl();

async function handleResponse(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json.error) message = json.error;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return res.json();
}

export async function get(path) {
  const res = await fetch(`${API_URL}${path}`);
  return handleResponse(res);
}

export async function post(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function put(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function postFormData(path, formData) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(res);
}

export async function checkHealth() {
  let data;
  try {
    data = await get("/api/health");
  } catch (err) {
    throw new Error(
      `Cannot reach Anki portal at ${API_URL}. Is the server running?\n  ${err.message}`
    );
  }
  if (!data.ok) {
    const issues = [];
    if (!data.checks?.ankiConnect) issues.push("AnkiConnect unreachable");
    const langs = data.checks?.languages || {};
    const anyLangReady = Object.values(langs).some((l) => l.deck && l.model);
    if (!anyLangReady) {
      issues.push("No spelling deck/note type found");
    }
    throw new Error(
      `Portal health check failed: ${issues.join(", ")}.\n  Ensure Anki is running with AnkiConnect enabled.`
    );
  }
  return data;
}

export { API_URL };
