"use client";

import type { SpellingCard } from "@/types/spelling";
import { SentenceEditor } from "./SentenceEditor";

interface SentenceListProps {
  cards: SpellingCard[];
  onUpdate: (cardId: string, updates: { word?: string; sentence?: string }) => void;
  onRemove: (cardId: string) => void;
}

export function SentenceList({ cards, onUpdate, onRemove }: SentenceListProps) {
  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No sentences extracted yet.
      </div>
    );
  }

  // Group by termWeek
  const grouped = cards.reduce(
    (acc, card) => {
      const key = `${card.termWeek} — ${card.topic}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(card);
      return acc;
    },
    {} as Record<string, SpellingCard[]>
  );

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([group, groupCards]) => (
        <div key={group}>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {group}
          </h3>
          <div className="space-y-2">
            {groupCards.map((card, i) => (
              <SentenceEditor
                key={card.id}
                card={card}
                index={i}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
