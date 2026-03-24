"use client";

import { useState } from "react";
import { Eraser, Loader2 } from "lucide-react";
import type { LanguageConfig } from "@/lib/languages";

type ClearableField = {
  key: string;
  label: string;
  group: "text" | "media";
};

const ALL_CLEARABLE_FIELDS: (ClearableField & { chineseOnly?: boolean; englishOnly?: boolean })[] = [
  { key: "sentence", label: "Sentence + Cloze", group: "text" },
  { key: "definition", label: "Definition", group: "text", englishOnly: true },
  { key: "phonetic", label: "Phonetic / Pinyin", group: "text" },
  { key: "synonyms", label: "Synonyms", group: "text", englishOnly: true },
  { key: "extra_info", label: "Extra Examples", group: "text" },
  { key: "sentencePinyin", label: "Sentence Pinyin", group: "text", chineseOnly: true },
  { key: "audio", label: "Word Audio", group: "media" },
  { key: "sentence_audio", label: "Sentence Audio", group: "media" },
  { key: "extra_info_audio", label: "Example Audio", group: "media" },
  { key: "image", label: "Image", group: "media" },
  { key: "strokeOrder", label: "Stroke Order", group: "media", chineseOnly: true },
];

interface ClearFieldsModalProps {
  noteCount: number;
  lang: LanguageConfig;
  onConfirm: (fields: string[]) => Promise<void>;
  onCancel: () => void;
}

export function ClearFieldsModal({ noteCount, lang, onConfirm, onCancel }: ClearFieldsModalProps) {
  const isChinese = lang.id === "chinese";
  const availableFields = ALL_CLEARABLE_FIELDS.filter((f) => {
    if (f.chineseOnly && !isChinese) return false;
    if (f.englishOnly && isChinese) return false;
    return true;
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);

  const toggleField = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === availableFields.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(availableFields.map((f) => f.key)));
    }
  };

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    setClearing(true);
    try {
      await onConfirm(Array.from(selected));
    } finally {
      setClearing(false);
    }
  };

  const textFields = availableFields.filter((f) => f.group === "text");
  const mediaFields = availableFields.filter((f) => f.group === "media");
  const allSelected = selected.size === availableFields.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="mx-4 w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Eraser className="h-5 w-5 text-warning shrink-0" />
          <h3 className="text-lg font-semibold">
            Clear Fields on {noteCount} Card{noteCount !== 1 ? "s" : ""}
          </h3>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          Select which fields to clear. Cleared fields can be re-generated via Enrich.
        </p>

        {/* Select All */}
        <div className="mt-4 mb-2">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="rounded"
            />
            Select All
          </label>
        </div>

        {/* Text fields */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Text Fields</p>
          <div className="grid grid-cols-2 gap-1">
            {textFields.map((f) => (
              <label key={f.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted">
                <input
                  type="checkbox"
                  checked={selected.has(f.key)}
                  onChange={() => toggleField(f.key)}
                  className="rounded"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        {/* Media fields */}
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Media Fields</p>
          <div className="grid grid-cols-2 gap-1">
            {mediaFields.map((f) => (
              <label key={f.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted">
                <input
                  type="checkbox"
                  checked={selected.has(f.key)}
                  onChange={() => toggleField(f.key)}
                  className="rounded"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        {/* Summary */}
        {selected.size > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Will clear {selected.size} field{selected.size !== 1 ? "s" : ""} on {noteCount} card{noteCount !== 1 ? "s" : ""}.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={clearing}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={clearing || selected.size === 0}
            className="rounded-md bg-warning px-4 py-2 text-sm font-medium text-warning-foreground hover:opacity-90 disabled:opacity-50"
          >
            {clearing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Clearing...
              </span>
            ) : (
              "Clear Fields"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
