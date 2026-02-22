"use client";

import { useCallback, useState } from "react";
import { Upload, Image, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
}

export function FileDropzone({
  files,
  onFilesChange,
  disabled,
}: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const dropped = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.type.startsWith("image/") || f.type === "application/pdf"
      );
      onFilesChange([...files, ...dropped]);
    },
    [files, onFilesChange, disabled]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const selected = Array.from(e.target.files);
      onFilesChange([...files, ...selected]);
      e.target.value = "";
    },
    [files, onFilesChange]
  );

  const removeFile = useCallback(
    (index: number) => {
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange]
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
          dragOver
            ? "border-primary bg-accent"
            : "border-border hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">
          Drop spelling worksheet images or PDFs here
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PNG, JPG, WEBP, or PDF
        </p>
        <label
          className={cn(
            "mt-4 inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity",
            disabled && "pointer-events-none"
          )}
        >
          Browse Files
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleInputChange}
            className="hidden"
            disabled={disabled}
          />
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            {files.length} file{files.length !== 1 ? "s" : ""} selected
          </p>
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm"
            >
              {file.type === "application/pdf" ? (
                <FileText className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Image className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                onClick={() => removeFile(i)}
                className="rounded p-0.5 hover:bg-border transition-colors"
                disabled={disabled}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
