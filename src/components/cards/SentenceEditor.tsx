"use client";

import { useState } from "react";
import { Pencil, Check, X, Trash2 } from "lucide-react";
import type { SpellingCard } from "@/types/spelling";
import { cn } from "@/lib/utils";

interface SentenceEditorProps {
  card: SpellingCard;
  index: number;
  onUpdate: (cardId: string, updates: { word?: string; sentence?: string }) => void;
  onRemove: (cardId: string) => void;
}

export function SentenceEditor({
  card,
  index,
  onUpdate,
  onRemove,
}: SentenceEditorProps) {
  const [editing, setEditing] = useState(false);
  const [editWord, setEditWord] = useState(card.word);
  const [editSentence, setEditSentence] = useState(card.sentence);

  const handleSave = () => {
    onUpdate(card.id, { word: editWord, sentence: editSentence });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditWord(card.word);
    setEditSentence(card.sentence);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        card.edited ? "border-warning/50 bg-warning/5" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Word/Phrase
                </label>
                <input
                  type="text"
                  value={editWord}
                  onChange={(e) => setEditWord(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Sentence
                </label>
                <textarea
                  value={editSentence}
                  onChange={(e) => setEditSentence(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  <Check className="h-3 w-3" /> Save
                </button>
                <button
                  onClick={handleCancel}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-border"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm leading-relaxed">
                <span
                  dangerouslySetInnerHTML={{ __html: card.mainSentence }}
                />
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="inline-flex items-center rounded bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                  {card.word}
                </span>
                {card.edited && (
                  <span className="text-xs text-warning">edited</span>
                )}
              </div>
            </div>
          )}
        </div>
        {!editing && (
          <div className="flex gap-1">
            <button
              onClick={() => setEditing(true)}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onRemove(card.id)}
              className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-destructive transition-colors"
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
