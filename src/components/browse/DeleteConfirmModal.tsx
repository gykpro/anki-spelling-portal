"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface DeleteConfirmModalProps {
  words: string[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteConfirmModal({ words, onConfirm, onCancel }: DeleteConfirmModalProps) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="mx-4 w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <h3 className="text-lg font-semibold">Delete {words.length} Card{words.length !== 1 ? "s" : ""}</h3>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          This will permanently delete these cards from the central instance and configured target endpoints. This cannot be undone.
        </p>

        {/* Word list */}
        <div className="mt-3 max-h-48 overflow-y-auto rounded border border-border bg-muted/50 p-3">
          <div className="flex flex-wrap gap-1.5">
            {words.map((word) => (
              <span
                key={word}
                className="rounded bg-background px-2 py-0.5 text-xs border border-border"
              >
                {word}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deleting...
              </span>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
