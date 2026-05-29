import React from "react";

interface CardMetaInput {
  setName?: string;
  setNumber?: string;
  rarity?: string;
  language?: string;
  condition: string;
  edition?: string;
  category?: string;
  isGraded: boolean;
  gradingCompany?: string;
  grade?: string;
  certNumber?: string;
}

interface CardMetaProps {
  card: CardMetaInput;
  showCategory?: boolean;
}

/**
 * Compact multi-line card detail block. Renders up to 3 lines:
 *  1. set · #number · rarity
 *  2. condition · language · edition (· category if showCategory)
 *  3. graded badge + company · grade · cert# (only if isGraded)
 */
export function CardMeta({ card, showCategory = false }: CardMetaProps) {
  const line1Parts = [
    card.setName,
    card.setNumber ? `#${card.setNumber}` : undefined,
    card.rarity,
  ].filter(Boolean);

  const line2Parts = [
    card.condition,
    card.language,
    card.edition,
    showCategory && card.category ? card.category : undefined,
  ].filter(Boolean);

  return (
    <div className="space-y-0.5">
      {line1Parts.length > 0 && (
        <p className="text-xs text-muted-fg truncate">{line1Parts.join(" · ")}</p>
      )}
      {line2Parts.length > 0 && (
        <p className="text-xs text-muted-fg truncate">{line2Parts.join(" · ")}</p>
      )}
      {card.isGraded && (
        <p className="text-xs text-accent font-semibold truncate">
          <span className="inline-block bg-accent bg-opacity-10 px-1.5 py-0.5 rounded text-[10px] font-extrabold tracking-wide mr-1">
            {card.gradingCompany ?? "Graded"}
          </span>
          {[card.grade, card.certNumber ? `#${card.certNumber}` : undefined]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
