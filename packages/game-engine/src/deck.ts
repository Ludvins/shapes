import { OBJECTIVE_CARDS, RANK_PATTERN_DISTRIBUTION, SHAPE_FAMILIES } from "./constants.js";
import { shuffleWithSeed } from "./random.js";
import type { Card, ObjectiveCard } from "./types.js";

export function createDeck(): Card[] {
  return SHAPE_FAMILIES.flatMap((shape) =>
    Object.entries(RANK_PATTERN_DISTRIBUTION).flatMap(([rank, patterns]) =>
      patterns.map((pattern, patternIndex) => ({
        id: `${shape}-${rank}-${pattern}-${patternIndex}`,
        shape,
        rank: Number(rank) as Card["rank"],
        pattern
      }))
    )
  );
}

export function createShuffledDeck(seed: string): Card[] {
  return shuffleWithSeed(createDeck(), seed);
}

export function selectObjectives(seed: string, count: number): ObjectiveCard[] {
  return shuffleWithSeed(OBJECTIVE_CARDS, `${seed}:objectives`).slice(0, count);
}
