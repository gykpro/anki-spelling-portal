import { copyFileSync, existsSync, mkdirSync } from "fs";
import { basename, join } from "path";
import { ankiConnect } from "@/lib/anki-connect";
import { getAllLanguages } from "@/lib/languages";
import { getConfig } from "@/lib/settings";

const INIT_PACKAGE_PATH = join(
  process.cwd(),
  "src",
  "app",
  "assets",
  "anki_init.apkg"
);

export interface AnkiSchemaClient {
  deckNames(): Promise<string[]>;
  modelNames(): Promise<string[]>;
  importPackage(path: string): Promise<void>;
}

export interface AnkiSchemaStatus {
  missingDecks: string[];
  missingModels: string[];
}

export interface EnsureAnkiSchemaResult extends AnkiSchemaStatus {
  imported: boolean;
  packagePath?: string;
}

interface FileOps {
  exists(path: string): boolean;
  mkdir(path: string): void;
  copy(source: string, destination: string): void;
}

interface EnsureAnkiSchemaOptions {
  assetPath?: string;
  sharedPath?: string;
  fileOps?: FileOps;
}

const defaultFileOps: FileOps = {
  exists: existsSync,
  mkdir(path: string) {
    mkdirSync(path, { recursive: true });
  },
  copy(source: string, destination: string) {
    if (source !== destination) {
      copyFileSync(source, destination);
    }
  },
};

function requiredDecks(): string[] {
  return getAllLanguages().map((lang) => lang.deck);
}

function requiredModels(): string[] {
  return getAllLanguages().map((lang) => lang.noteType);
}

function formatList(values: string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}

export async function getAnkiSchemaStatus(
  client: AnkiSchemaClient
): Promise<AnkiSchemaStatus> {
  const [decks, models] = await Promise.all([
    client.deckNames(),
    client.modelNames(),
  ]);

  return {
    missingDecks: requiredDecks().filter((deck) => !decks.includes(deck)),
    missingModels: requiredModels().filter((model) => !models.includes(model)),
  };
}

export async function ensureAnkiSchema(
  client: AnkiSchemaClient = ankiConnect,
  options: EnsureAnkiSchemaOptions = {}
): Promise<EnsureAnkiSchemaResult> {
  const initialStatus = await getAnkiSchemaStatus(client);
  if (
    initialStatus.missingDecks.length === 0 &&
    initialStatus.missingModels.length === 0
  ) {
    return { ...initialStatus, imported: false };
  }

  const fileOps = options.fileOps ?? defaultFileOps;
  const assetPath = options.assetPath ?? INIT_PACKAGE_PATH;

  if (!fileOps.exists(assetPath)) {
    throw new Error(
      `Anki schema is missing decks (${formatList(initialStatus.missingDecks)}) ` +
        `or note types (${formatList(initialStatus.missingModels)}), and the init package ` +
        `was not found at ${assetPath}. Add src/app/assets/anki_init.apkg or initialize Anki manually.`
    );
  }

  const sharedPath = options.sharedPath ?? getConfig("EXPORT_SHARED_PATH");
  fileOps.mkdir(sharedPath);
  const importPath = join(sharedPath, basename(assetPath));
  fileOps.copy(assetPath, importPath);

  await client.importPackage(importPath);

  const finalStatus = await getAnkiSchemaStatus(client);
  if (
    finalStatus.missingDecks.length > 0 ||
    finalStatus.missingModels.length > 0
  ) {
    throw new Error(
      `Imported ${assetPath}, but Anki is still missing decks ` +
        `(${formatList(finalStatus.missingDecks)}) or note types ` +
        `(${formatList(finalStatus.missingModels)}).`
    );
  }

  return {
    ...initialStatus,
    imported: true,
    packagePath: importPath,
  };
}
