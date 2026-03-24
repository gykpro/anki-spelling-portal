"use client";

import { useEffect, useRef } from "react";
import { X, ExternalLink, Volume2, Check, Minus } from "lucide-react";
import type { AnkiNote } from "@/types/anki";
import { cn } from "@/lib/utils";

interface NoteDetailDrawerProps {
  note: AnkiNote | null;
  onClose: () => void;
}

function getField(note: AnkiNote, field: string): string {
  return note.fields[field]?.value || "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/** Rewrite img src attributes to serve via the Anki media API */
function rewriteMediaSrc(html: string): string {
  return html.replace(
    /(<img\s[^>]*?)src="([^"]+)"/gi,
    (_match, prefix, src) => {
      // Skip already-absolute URLs
      if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/api/")) {
        return `${prefix}src="${src}"`;
      }
      return `${prefix}src="/api/anki/media?filename=${encodeURIComponent(src)}"`;
    }
  );
}

function FieldStatus({ filled }: { filled: boolean }) {
  return filled ? (
    <Check className="h-3.5 w-3.5 text-success shrink-0" />
  ) : (
    <Minus className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
  );
}

function FieldRow({
  label,
  value,
  raw,
  mono,
}: {
  label: string;
  value: string;
  raw?: string;
  mono?: boolean;
}) {
  const filled = !!(raw ?? value);
  return (
    <div className="flex gap-2 py-1.5">
      <FieldStatus filled={!!filled} />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {filled ? (
          <p
            className={cn(
              "mt-0.5 text-sm break-words",
              mono && "font-mono text-xs"
            )}
          >
            {value}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/50 italic">
            Empty
          </p>
        )}
      </div>
    </div>
  );
}

function AudioField({ label, value }: { label: string; value: string }) {
  const filled = !!value;
  // Extract filename from [sound:filename.mp3] format
  const filename = value.match(/\[sound:(.+?)\]/)?.[1] || "";

  return (
    <div className="flex gap-2 py-1.5">
      <FieldStatus filled={filled} />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {filled && filename ? (
          <div className="mt-1 space-y-1">
            <div className="flex items-center gap-2">
              <Volume2 className="h-3.5 w-3.5 text-success shrink-0" />
              <span className="text-xs text-muted-foreground truncate">
                {filename}
              </span>
            </div>
            <audio controls preload="none" className="h-8 w-full max-w-xs">
              <source
                src={`/api/anki/media?filename=${encodeURIComponent(filename)}`}
                type="audio/mpeg"
              />
            </audio>
          </div>
        ) : filled ? (
          <div className="mt-1 flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5 text-success shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              {value}
            </span>
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/50 italic">
            Empty
          </p>
        )}
      </div>
    </div>
  );
}

function ImageField({ label, value }: { label: string; value: string }) {
  const filled = !!value;

  return (
    <div className="flex gap-2 py-1.5">
      <FieldStatus filled={filled} />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {filled ? (
          <div
            className="mt-1 text-xs [&_img]:max-h-24 [&_img]:rounded [&_img]:border [&_img]:border-border"
            dangerouslySetInnerHTML={{ __html: rewriteMediaSrc(value) }}
          />
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/50 italic">
            Empty
          </p>
        )}
      </div>
    </div>
  );
}

function StrokeOrderField({ label, value, word }: { label: string; value: string; word: string }) {
  const filled = !!value;
  const imgCount = (value.match(/<img/g) || []).length;
  const cjkChars = word.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [];
  const isPartial = filled && imgCount < cjkChars.length;

  return (
    <div className="flex gap-2 py-1.5">
      <FieldStatus filled={filled && !isPartial} />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
          {isPartial && (
            <span className="ml-1 text-warning">
              (partial: {imgCount}/{cjkChars.length} chars)
            </span>
          )}
        </span>
        {filled ? (
          <div
            className="mt-1 flex flex-wrap gap-1 [&_img]:h-16 [&_img]:rounded [&_img]:border [&_img]:border-border"
            dangerouslySetInnerHTML={{ __html: rewriteMediaSrc(value) }}
          />
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/50 italic">
            Empty
          </p>
        )}
      </div>
    </div>
  );
}

export function NoteDetailDrawer({ note, onClose }: NoteDetailDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!note) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [note, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!note) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing immediately from the click that opened the drawer
    const timeout = setTimeout(() => {
      window.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("mousedown", handler);
    };
  }, [note, onClose]);

  if (!note) return null;

  const word = getField(note, "Word");
  const isChinese = note.modelName === "school Chinese spelling";

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/20" />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-border bg-background shadow-xl animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold truncate">{word}</h3>
            <p className="text-xs text-muted-foreground">
              {note.modelName} &middot; ID: {note.noteId}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <a
              href={`/enrich?noteIds=${note.noteId}`}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <ExternalLink className="h-3 w-3" /> Enrich
            </a>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Core fields */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Core
            </h4>
            <div className="space-y-0.5">
              <FieldRow label="Word" value={word} />
              <FieldRow
                label="Main Sentence"
                value={stripHtml(getField(note, "Main Sentence"))}
                raw={getField(note, "Main Sentence")}
              />
              <FieldRow
                label="Cloze"
                value={stripHtml(getField(note, "Cloze"))}
                raw={getField(note, "Cloze")}
                mono
              />
              <FieldRow
                label="Definition"
                value={stripHtml(getField(note, "Definition"))}
                raw={getField(note, "Definition")}
              />
            </div>
          </section>

          {/* Phonetics & Language */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Phonetics & Language
            </h4>
            <div className="space-y-0.5">
              <FieldRow
                label="Phonetic Symbol"
                value={getField(note, "Phonetic symbol")}
                mono
              />
              {isChinese && (
                <FieldRow
                  label="Main Sentence Pinyin"
                  value={getField(note, "Main Sentence Pinyin")}
                  mono
                />
              )}
            </div>
          </section>

          {/* Extended */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Extended
            </h4>
            <div className="space-y-0.5">
              <FieldRow
                label="Synonyms"
                value={stripHtml(getField(note, "Synonyms"))}
                raw={getField(note, "Synonyms")}
              />
              <FieldRow
                label="Extra Information"
                value={stripHtml(getField(note, "Extra information"))}
                raw={getField(note, "Extra information")}
              />
            </div>
          </section>

          {/* Media */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Media
            </h4>
            <div className="space-y-0.5">
              <AudioField label="Audio" value={getField(note, "Audio")} />
              <AudioField
                label="Main Sentence Audio"
                value={getField(note, "Main Sentence Audio")}
              />
              <ImageField label="Picture" value={getField(note, "Picture")} />
              {isChinese && (
                <StrokeOrderField
                  label="Stroke Order"
                  value={getField(note, "Stroke Order Anim")}
                  word={word}
                />
              )}
            </div>
          </section>

          {/* Tags */}
          {note.tags.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Tags
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
