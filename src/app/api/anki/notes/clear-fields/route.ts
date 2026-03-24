import { NextRequest, NextResponse } from "next/server";
import { ankiConnect } from "@/lib/anki-connect";
import { writeQueue } from "@/lib/write-queue";

/** Map enrichment field keys to Anki note field names */
const FIELD_KEY_TO_ANKI: Record<string, string> = {
  sentence: "Main Sentence",
  definition: "Definition",
  phonetic: "Phonetic symbol",
  synonyms: "Synonyms",
  extra_info: "Extra information",
  sentencePinyin: "Main Sentence Pinyin",
  audio: "Audio",
  sentence_audio: "Main Sentence Audio",
  image: "Picture",
  strokeOrder: "Stroke Order Anim",
};

/** Fields that should be auto-cleared when their parent is cleared */
const DEPENDENT_FIELDS: Record<string, string[]> = {
  sentence: ["Cloze", "Main Sentence Audio", "Main Sentence Pinyin"],
  extra_info: [], // extra_info_audio is embedded in the field, cleared with it
};

/** POST: Clear specified enrichment fields on notes */
export async function POST(request: NextRequest) {
  try {
    const { noteIds, fields } = await request.json();

    if (!noteIds?.length || !fields?.length) {
      return NextResponse.json(
        { error: "noteIds and fields are required" },
        { status: 400 }
      );
    }

    // Build the set of Anki field names to clear
    const ankiFieldsToClear = new Set<string>();

    for (const fieldKey of fields) {
      // Special case: extra_info_audio clears sound tags from Extra information
      if (fieldKey === "extra_info_audio") {
        // Handled separately per note below
        continue;
      }

      const ankiField = FIELD_KEY_TO_ANKI[fieldKey];
      if (ankiField) {
        ankiFieldsToClear.add(ankiField);

        // Add dependent fields
        const deps = DEPENDENT_FIELDS[fieldKey];
        if (deps) {
          for (const dep of deps) ankiFieldsToClear.add(dep);
        }
      }
    }

    const clearExtraInfoAudio = fields.includes("extra_info_audio");

    const updated = await writeQueue.enqueue(async () => {
      await ankiConnect.syncBeforeWrite();

      let count = 0;

      // If we need to strip audio from Extra information, fetch note data first
      if (clearExtraInfoAudio && !ankiFieldsToClear.has("Extra information")) {
        const notes = await ankiConnect.notesInfo(noteIds);
        for (const note of notes) {
          const updateFields: Record<string, string> = {};

          // Clear standard fields
          for (const field of ankiFieldsToClear) {
            if (note.fields[field] !== undefined) {
              updateFields[field] = "";
            }
          }

          // Strip [sound:...] tags from Extra information
          const extraInfo = note.fields["Extra information"]?.value || "";
          if (extraInfo) {
            updateFields["Extra information"] = extraInfo.replace(
              /\[sound:[^\]]+\]/g,
              ""
            );
          }

          if (Object.keys(updateFields).length > 0) {
            await ankiConnect.updateNoteFields({
              id: note.noteId,
              fields: updateFields,
            });
            count++;
          }
        }
      } else {
        // Simple case: just clear fields to empty
        for (const noteId of noteIds) {
          const updateFields: Record<string, string> = {};
          for (const field of ankiFieldsToClear) {
            updateFields[field] = "";
          }

          if (Object.keys(updateFields).length > 0) {
            await ankiConnect.updateNoteFields({
              id: noteId,
              fields: updateFields,
            });
            count++;
          }
        }
      }

      return count;
    });

    return NextResponse.json({ updated });
  } catch (error) {
    console.error("Clear fields error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to clear fields",
      },
      { status: 500 }
    );
  }
}
