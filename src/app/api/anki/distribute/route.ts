import { NextRequest, NextResponse } from "next/server";
import { ankiConnect, withProfileLock } from "@/lib/anki-connect";
import { writeQueue } from "@/lib/write-queue";
import { getConfig } from "@/lib/settings";
import type { DistributeResult } from "@/types/anki";
import { getLanguageByNoteType } from "@/lib/languages";

/** POST: Distribute notes from current profile to target profiles */
export async function POST(request: NextRequest) {
  try {
    const { noteIds, targetProfiles, mediaFiles } = await request.json();

    if (!noteIds?.length || !targetProfiles?.length) {
      return NextResponse.json(
        { error: "noteIds and targetProfiles are required" },
        { status: 400 }
      );
    }

    // Build media cache from optional mediaFiles array
    const mediaCache = new Map<string, string>();
    if (Array.isArray(mediaFiles)) {
      for (const mf of mediaFiles) {
        if (mf.filename && mf.data) {
          mediaCache.set(mf.filename, mf.data);
        }
      }
    }

    const results = await writeQueue.enqueue(async () => {
      // Fetch source notes from current profile
      const sourceNotes = await ankiConnect.notesInfo(noteIds);
      if (sourceNotes.length === 0) {
        throw new Error("No source notes found");
      }

      // Detect language from first note's model name
      const firstNote = sourceNotes[0];
      const lang = getLanguageByNoteType(firstNote.modelName);
      const deckName = lang?.deck ?? firstNote.modelName;
      const modelName = lang?.noteType ?? firstNote.modelName;

      const homeProfile = getConfig("ACTIVE_PROFILE");
      if (!homeProfile) {
        throw new Error("Active profile not set. Switch profile from Settings first.");
      }

      const distResults: DistributeResult[] = [];

      for (const targetProfile of targetProfiles) {
        if (targetProfile === homeProfile) continue;

        const result = await withProfileLock(async () => {
          try {
            await ankiConnect.loadProfileAndWait(targetProfile);

            const decks = await ankiConnect.deckNames();
            if (!decks.includes(deckName)) {
              await ankiConnect.loadProfileAndWait(homeProfile);
              return {
                profile: targetProfile,
                success: false,
                error: `Deck "${deckName}" not found in profile "${targetProfile}"`,
                notesDistributed: 0,
              };
            }

            const models = await ankiConnect.modelNames();
            if (!models.includes(modelName)) {
              await ankiConnect.loadProfileAndWait(homeProfile);
              return {
                profile: targetProfile,
                success: false,
                error: `Note type "${modelName}" not found in profile "${targetProfile}"`,
                notesDistributed: 0,
              };
            }

            if (mediaCache.size > 0) {
              for (const [filename, data] of mediaCache) {
                try {
                  await ankiConnect.storeMediaFile(filename, data);
                } catch (err) {
                  console.warn(`[Distribute] Failed to store media "${filename}" in ${targetProfile}:`, err);
                }
              }
            }

            let distributed = 0;

            for (const note of sourceNotes) {
              const fields: Record<string, string> = {};
              for (const [key, val] of Object.entries(note.fields)) {
                fields[key] = val.value;
              }

              const uuid = fields["Note ID"];
              if (!uuid) continue;

              const existing = await ankiConnect.findNotes(
                `deck:"${deckName}" "${uuid}"`
              );

              if (existing.length > 0) {
                await ankiConnect.updateNoteFields({
                  id: existing[0],
                  fields,
                });
              } else {
                try {
                  await ankiConnect.addNote({
                    deckName,
                    modelName,
                    fields,
                    tags: note.tags,
                  });
                } catch (err) {
                  console.warn(
                    `[Distribute] addNote failed for "${fields.Word}" in ${targetProfile}:`,
                    err
                  );
                  continue;
                }
              }
              distributed++;
            }

            await ankiConnect.loadProfileAndWait(homeProfile);

            return {
              profile: targetProfile,
              success: true,
              notesDistributed: distributed,
            };
          } catch (err) {
            try {
              await ankiConnect.loadProfileAndWait(homeProfile);
            } catch { /* ignore */ }

            return {
              profile: targetProfile,
              success: false,
              error: err instanceof Error ? err.message : "Distribution failed",
              notesDistributed: 0,
            };
          }
        });

        distResults.push(result);
      }

      return distResults;
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Distribute error:", error);
    const msg = error instanceof Error ? error.message : "Distribution failed";
    const status = msg.includes("No source notes found") ? 404
      : msg.includes("Active profile not set") ? 400
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
