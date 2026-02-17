"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  X,
  Cpu,
  Terminal,
  Zap,
  MessageCircle,
} from "lucide-react";

interface ConfigStatus {
  configured: boolean;
  source: "file" | "env" | "default" | "none";
  maskedValue: string | null;
  secret: boolean;
  description: string;
}

type ConfigKey =
  | "ANTHROPIC_API_KEY"
  | "CLAUDE_CODE_OAUTH_TOKEN"
  | "AZURE_TTS_KEY"
  | "AZURE_TTS_REGION"
  | "NANO_BANANA_API_KEY"
  | "ANKI_CONNECT_URL"
  | "AI_BACKEND"
  | "TELEGRAM_BOT_TOKEN"
  | "TELEGRAM_ALLOWED_USERS";

type SettingsData = Record<ConfigKey, ConfigStatus>;

const SECTIONS = {
  aiBackend: {
    title: "AI Backend",
    description: "Choose how AI calls are made. SDK uses the Anthropic API (pay-per-use). CLI uses Claude Code with your Max subscription (free).",
    keys: ["AI_BACKEND"] as ConfigKey[],
  },
  apiKeys: {
    title: "API Keys",
    description: "Secret keys for AI and media services. Stored locally, never exposed via the API.",
    keys: [
      "ANTHROPIC_API_KEY",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "AZURE_TTS_KEY",
      "NANO_BANANA_API_KEY",
    ] as ConfigKey[],
  },
  configuration: {
    title: "Configuration",
    description: "Non-secret service configuration.",
    keys: ["AZURE_TTS_REGION", "ANKI_CONNECT_URL"] as ConfigKey[],
  },
  telegram: {
    title: "Telegram Bot",
    description: "Send words or worksheet photos via Telegram to add and enrich cards automatically. Create a bot via @BotFather to get a token.",
    keys: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USERS"] as ConfigKey[],
  },
};

const KEY_LABELS: Record<ConfigKey, string> = {
  ANTHROPIC_API_KEY: "Anthropic API Key",
  CLAUDE_CODE_OAUTH_TOKEN: "Claude OAuth Token",
  AZURE_TTS_KEY: "Azure TTS Key",
  AZURE_TTS_REGION: "Azure TTS Region",
  NANO_BANANA_API_KEY: "Gemini API Key",
  ANKI_CONNECT_URL: "AnkiConnect URL",
  AI_BACKEND: "Backend Mode",
  TELEGRAM_BOT_TOKEN: "Bot Token",
  TELEGRAM_ALLOWED_USERS: "Allowed User IDs",
};

const KEY_PLACEHOLDERS: Partial<Record<ConfigKey, string>> = {
  ANTHROPIC_API_KEY: "sk-ant-...",
  CLAUDE_CODE_OAUTH_TOKEN: "Paste token from claude setup-token",
  AZURE_TTS_KEY: "Azure subscription key",
  AZURE_TTS_REGION: "australiaeast",
  NANO_BANANA_API_KEY: "AIza...",
  ANKI_CONNECT_URL: "http://localhost:8765",
  TELEGRAM_BOT_TOKEN: "123456:ABC-DEF...",
  TELEGRAM_ALLOWED_USERS: "123456789, 987654321",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [aiBackend, setAiBackend] = useState<"sdk" | "cli" | "none">("none");
  const [dirty, setDirty] = useState<Partial<Record<ConfigKey, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);
  const [showSecrets, setShowSecrets] = useState<Partial<Record<ConfigKey, boolean>>>({});

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setSettings(data.settings);
      setAiBackend(data.aiBackend);
    } catch {
      // Ignore — will show loading state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(true);
    setSaveResult(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: dirty }),
      });
      const data = await res.json();
      if (data.saved) {
        setSettings(data.settings);
        setAiBackend(data.aiBackend);
        setDirty({});
        setSaveResult("success");
        setTimeout(() => setSaveResult(null), 3000);
      } else {
        setSaveResult("error");
      }
    } catch {
      setSaveResult("error");
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: ConfigKey, value: string) => {
    setDirty((prev) => ({ ...prev, [key]: value }));
  };

  const clearField = (key: ConfigKey) => {
    setDirty((prev) => ({ ...prev, [key]: "" }));
  };

  const isDirty = Object.keys(dirty).length > 0;

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage API keys and service configuration
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveResult === "success" && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
          {saveResult === "error" && (
            <span className="flex items-center gap-1 text-sm text-red-600">
              <XCircle className="h-4 w-4" /> Save failed
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* AI Backend Section */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{SECTIONS.aiBackend.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {SECTIONS.aiBackend.description}
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Active backend:</span>
          <BackendBadge backend={aiBackend} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {(["auto", "sdk", "cli"] as const).map((mode) => {
            const currentValue = dirty.AI_BACKEND ?? settings.AI_BACKEND.maskedValue ?? "auto";
            const isSelected = currentValue === mode;
            return (
              <button
                key={mode}
                onClick={() => setField("AI_BACKEND", mode)}
                className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                {mode === "auto" && <Zap className="h-4 w-4 text-amber-500" />}
                {mode === "sdk" && <Cpu className="h-4 w-4 text-blue-500" />}
                {mode === "cli" && <Terminal className="h-4 w-4 text-green-500" />}
                <div>
                  <div className="text-sm font-medium capitalize">{mode}</div>
                  <div className="text-xs text-muted-foreground">
                    {mode === "auto" && "Use SDK if available, else CLI"}
                    {mode === "sdk" && "Anthropic API (pay-per-use)"}
                    {mode === "cli" && "Claude Code CLI (Max subscription)"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* API Keys Section */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{SECTIONS.apiKeys.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {SECTIONS.apiKeys.description}
          </p>
        </div>
        <div className="space-y-3">
          {SECTIONS.apiKeys.keys.map((key) => (
            <SettingsField
              key={key}
              configKey={key}
              status={settings[key]}
              dirtyValue={dirty[key]}
              onChange={(val) => setField(key, val)}
              onClear={() => clearField(key)}
              showSecret={showSecrets[key] ?? false}
              onToggleSecret={() =>
                setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }))
              }
            />
          ))}
        </div>
      </section>

      {/* Configuration Section */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{SECTIONS.configuration.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {SECTIONS.configuration.description}
          </p>
        </div>
        <div className="space-y-3">
          {SECTIONS.configuration.keys.map((key) => (
            <SettingsField
              key={key}
              configKey={key}
              status={settings[key]}
              dirtyValue={dirty[key]}
              onChange={(val) => setField(key, val)}
              onClear={() => clearField(key)}
              showSecret={false}
              onToggleSecret={() => {}}
            />
          ))}
        </div>
      </section>

      {/* Telegram Bot Section */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-blue-500" />
          <div>
            <h2 className="text-lg font-semibold">{SECTIONS.telegram.title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {SECTIONS.telegram.description}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {SECTIONS.telegram.keys.map((key) => (
            <SettingsField
              key={key}
              configKey={key}
              status={settings[key]}
              dirtyValue={dirty[key]}
              onChange={(val) => setField(key, val)}
              onClear={() => clearField(key)}
              showSecret={showSecrets[key] ?? false}
              onToggleSecret={() =>
                setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }))
              }
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          The bot starts automatically when the server boots (if a token is configured). Restart the server after changing the token.
          Leave "Allowed User IDs" empty to allow all users.
        </p>
      </section>
    </div>
  );
}

function BackendBadge({ backend }: { backend: "sdk" | "cli" | "none" }) {
  if (backend === "sdk") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        <Cpu className="h-3 w-3" /> SDK
      </span>
    );
  }
  if (backend === "cli") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <Terminal className="h-3 w-3" /> CLI
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
      <XCircle className="h-3 w-3" /> Not configured
    </span>
  );
}

function StatusBadge({ status }: { status: ConfigStatus }) {
  if (status.configured) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <CheckCircle2 className="h-3 w-3 text-green-600" />
        <span className="text-green-700">
          {status.source === "default" ? "Default" : "Configured"}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <XCircle className="h-3 w-3" /> Not set
    </span>
  );
}

function SettingsField({
  configKey,
  status,
  dirtyValue,
  onChange,
  onClear,
  showSecret,
  onToggleSecret,
}: {
  configKey: ConfigKey;
  status: ConfigStatus;
  dirtyValue: string | undefined;
  onChange: (val: string) => void;
  onClear: () => void;
  showSecret: boolean;
  onToggleSecret: () => void;
}) {
  const hasDirtyValue = dirtyValue !== undefined;
  const willClear = hasDirtyValue && dirtyValue === "";

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{KEY_LABELS[configKey]}</label>
          <StatusBadge status={status} />
        </div>
        {status.configured && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Remove stored value"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{status.description}</p>
      <div className="relative">
        <input
          type={status.secret && !showSecret ? "password" : "text"}
          placeholder={KEY_PLACEHOLDERS[configKey] ?? ""}
          value={hasDirtyValue ? dirtyValue : ""}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            willClear ? "border-red-300 bg-red-50/50" : "border-border"
          }`}
        />
        {status.secret && (
          <button
            type="button"
            onClick={onToggleSecret}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {willClear && (
        <p className="text-xs text-red-600">
          Will remove stored value on save
        </p>
      )}
      {status.configured && status.secret && !hasDirtyValue && (
        <p className="text-xs text-muted-foreground">
          Current: {status.maskedValue}
        </p>
      )}
    </div>
  );
}
