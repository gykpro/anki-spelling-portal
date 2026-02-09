"use client";

import { FileDropzone } from "@/components/upload/FileDropzone";
import { SentenceList } from "@/components/cards/SentenceList";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useExtraction } from "@/hooks/useExtraction";
import {
  CheckCircle,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Send,
} from "lucide-react";

export default function UploadPage() {
  const {
    step,
    files,
    cards,
    error,
    submitResult,
    setFiles,
    extract,
    updateCard,
    removeCard,
    submit,
    reset,
  } = useExtraction();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Upload & Extract
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload spelling worksheet images, extract sentences, review, and push
          to Anki
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={step === "idle" ? "font-semibold text-primary" : ""}>
          1. Upload
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className={step === "extracting" ? "font-semibold text-primary" : ""}>
          2. Extract
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className={step === "review" ? "font-semibold text-primary" : ""}>
          3. Review
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className={step === "submitting" || step === "done" ? "font-semibold text-primary" : ""}>
          4. Submit
        </span>
      </div>

      {/* Upload section */}
      {(step === "idle" || step === "error") && (
        <div className="space-y-4">
          <FileDropzone
            files={files}
            onFilesChange={setFiles}
            disabled={false}
          />
          {files.length > 0 && (
            <button
              onClick={extract}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Extract Sentences
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Extracting */}
      {step === "extracting" && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border p-12">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm font-medium">
            Extracting sentences from {files.length} page
            {files.length !== 1 ? "s" : ""}...
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Using Claude Code — this may take 30-60 seconds
          </p>
        </div>
      )}

      {/* Review */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {cards.length} sentences extracted — review and edit below
            </p>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-border"
              >
                <RotateCcw className="h-3 w-3" /> Start Over
              </button>
              <button
                onClick={submit}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                <Send className="h-3 w-3" /> Submit to Anki
              </button>
            </div>
          </div>
          <SentenceList
            cards={cards}
            onUpdate={updateCard}
            onRemove={removeCard}
          />
          <div className="flex justify-end">
            <button
              onClick={submit}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Send className="h-4 w-4" /> Submit {cards.length} Cards to Anki
            </button>
          </div>
        </div>
      )}

      {/* Submitting */}
      {step === "submitting" && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border p-12">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm font-medium">
            Creating {cards.length} cards in Anki...
          </p>
        </div>
      )}

      {/* Done */}
      {step === "done" && submitResult && (
        <div className="rounded-lg border border-success/50 bg-success/5 p-6 text-center">
          <CheckCircle className="mx-auto h-10 w-10 text-success" />
          <h3 className="mt-3 text-lg font-semibold">
            Cards Created Successfully
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {submitResult.created} cards created
            {submitResult.failed > 0 && (
              <>, {submitResult.failed} failed (likely duplicates)</>
            )}
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <RotateCcw className="h-4 w-4" /> Upload More
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Error</p>
              <p className="mt-0.5 text-xs text-destructive/80">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
