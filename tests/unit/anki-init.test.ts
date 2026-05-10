import { describe, expect, it } from "vitest";
import { ensureAnkiSchema } from "@/lib/anki-init";

class FakeSchemaClient {
  imports: string[] = [];

  constructor(
    private decks: string[],
    private models: string[],
    private readonly importResult?: { decks: string[]; models: string[] }
  ) {}

  async deckNames(): Promise<string[]> {
    return this.decks;
  }

  async modelNames(): Promise<string[]> {
    return this.models;
  }

  async importPackage(path: string): Promise<void> {
    this.imports.push(path);
    if (this.importResult) {
      this.decks = this.importResult.decks;
      this.models = this.importResult.models;
    }
  }
}

describe("ensureAnkiSchema", () => {
  it("does nothing when required decks and note types already exist", async () => {
    const client = new FakeSchemaClient(
      ["Gao English Spelling", "Gao Chinese"],
      ["school spelling", "school Chinese spelling"]
    );

    const result = await ensureAnkiSchema(client, {
      assetPath: "/repo/src/app/assets/anki_init.apkg",
      sharedPath: "/exports",
      fileOps: {
        exists: () => {
          throw new Error("asset should not be checked");
        },
        mkdir: () => undefined,
        copy: () => undefined,
      },
    });

    expect(result.imported).toBe(false);
    expect(client.imports).toEqual([]);
  });

  it("copies the init package to the shared path and imports it when schema is missing", async () => {
    const client = new FakeSchemaClient([], [], {
      decks: ["Gao English Spelling", "Gao Chinese"],
      models: ["school spelling", "school Chinese spelling"],
    });
    const copied: { source: string; destination: string }[] = [];
    const madeDirs: string[] = [];

    const result = await ensureAnkiSchema(client, {
      assetPath: "/repo/src/app/assets/anki_init.apkg",
      sharedPath: "/exports",
      fileOps: {
        exists: () => true,
        mkdir: (path) => madeDirs.push(path),
        copy: (source, destination) => copied.push({ source, destination }),
      },
    });

    expect(result).toEqual({
      imported: true,
      missingDecks: ["Gao English Spelling", "Gao Chinese"],
      missingModels: ["school spelling", "school Chinese spelling"],
      packagePath: "/exports/anki_init.apkg",
    });
    expect(madeDirs).toEqual(["/exports"]);
    expect(copied).toEqual([
      {
        source: "/repo/src/app/assets/anki_init.apkg",
        destination: "/exports/anki_init.apkg",
      },
    ]);
    expect(client.imports).toEqual(["/exports/anki_init.apkg"]);
  });

  it("fails with a setup error when schema is missing and the init package is absent", async () => {
    const client = new FakeSchemaClient([], []);

    await expect(
      ensureAnkiSchema(client, {
        assetPath: "/repo/src/app/assets/anki_init.apkg",
        sharedPath: "/exports",
        fileOps: {
          exists: () => false,
          mkdir: () => undefined,
          copy: () => undefined,
        },
      })
    ).rejects.toThrow(/Add src\/app\/assets\/anki_init\.apkg/);
  });
});
