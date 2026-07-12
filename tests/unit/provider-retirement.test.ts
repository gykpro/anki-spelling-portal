import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ACTIVE_PROVIDER_SURFACES = [
  ".claude/settings.local.json",
  ".claude/skills/anki-enrich/SKILL.md",
  "CLAUDE.md",
  "README.md",
  "docs/handoff-per-instance-distribution.md",
  "docs/nas-setup.md",
  "docs/telegram-setup.md",
  "docs/todo.md",
  "scripts/dev-startup.mjs",
  "skill/scripts/enrich-image.mjs",
  "src/app/api/enrich/route.ts",
  "src/app/settings/page.tsx",
  "src/lib/settings.ts",
  "src/lib/enrichment-pipeline.ts",
  "tests/ui-test-plan.md",
] as const;

// Dated records under docs/superpowers/specs and docs/superpowers/plans are
// intentionally absent: they remain valid history rather than active guidance.
const RETIRED_PROVIDER_MARKERS = [
  {
    label: "provider name",
    value: ["gem", "ini"].join(""),
  },
  {
    label: "provider product name",
    value: ["nano", " banana"].join(""),
  },
  {
    label: "provider settings key",
    value: ["nano", "_banana", "_api", "_key"].join(""),
  },
  {
    label: "provider API domain",
    value: ["generative", "language.google", "apis.com"].join(""),
  },
  {
    label: "provider documentation domain",
    value: ["ai.", "google.dev"].join(""),
  },
  {
    label: "provider helper domain",
    value: ["nano", "bnana.com"].join(""),
  },
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("retired image provider", () => {
  it("has no endpoint, key, name, or domain residue in active surfaces", () => {
    const violations = ACTIVE_PROVIDER_SURFACES.flatMap((relativePath) =>
      readRepoFile(relativePath)
        .split("\n")
        .flatMap((line, index) => {
          const normalizedLine = line.toLowerCase();

          return RETIRED_PROVIDER_MARKERS.filter(({ value }) =>
            normalizedLine.includes(value)
          ).map(({ label }) => `${relativePath}:${index + 1} (${label})`);
        })
    );

    expect(
      violations,
      `Active provider residue:\n${violations.join("\n")}`
    ).toEqual([]);
  });

  it("keeps file-managed runtime settings out of Docker build contexts", () => {
    const dockerIgnoreEntries = readRepoFile(".dockerignore")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    expect(dockerIgnoreEntries).toContain("/data");
  });
});
