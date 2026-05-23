import { MAX_CRACK_TOKENS, MAX_INSIGHT_TOKENS, RANKS, SHAPE_FAMILIES } from "./constants.js";
import type { Card, GameState } from "./types.js";

function collectCards(state: GameState): Card[] {
  return [
    ...state.deck,
    ...state.draftRow,
    ...state.discardPile,
    ...state.players.flatMap((player) => player.hand.map((handCard) => handCard.card)),
    ...SHAPE_FAMILIES.flatMap((shape) => state.blueprints[shape])
  ];
}

export function validateGameState(state: GameState): string[] {
  const issues: string[] = [];

  if (state.players.length < 2 || state.players.length > 5) {
    issues.push("Player count must stay between 2 and 5.");
  }

  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= state.players.length) {
    issues.push("Current player index is out of range.");
  }

  if (state.insightTokens < 0 || state.insightTokens > MAX_INSIGHT_TOKENS) {
    issues.push("Insight token count is out of range.");
  }

  if (state.crackTokens < 0 || state.crackTokens > MAX_CRACK_TOKENS) {
    issues.push("Crack token count is out of range.");
  }

  if (state.finalTurnsRemaining !== null && state.finalTurnsRemaining < 0) {
    issues.push("Final turns remaining cannot be negative.");
  }

  SHAPE_FAMILIES.forEach((shape) => {
    const cards = state.blueprints[shape];
    const expectedRanks = RANKS.slice(0, cards.length);

    cards.forEach((card, index) => {
      if (card.shape !== shape) {
        issues.push(`${card.id} is in the wrong blueprint.`);
      }

      if (card.rank !== expectedRanks[index]) {
        issues.push(`${shape} blueprint is not contiguous from rank 1.`);
      }
    });
  });

  const cardIds = collectCards(state).map((card) => card.id);
  const uniqueCardIds = new Set(cardIds);

  if (cardIds.length !== 50) {
    issues.push(`Expected 50 cards across all zones, found ${cardIds.length}.`);
  }

  if (uniqueCardIds.size !== cardIds.length) {
    issues.push("Duplicate card ids found across game zones.");
  }

  if (state.phase === "finished" && state.finishReason === null) {
    issues.push("Finished games must include a finish reason.");
  }

  if (state.phase === "playing" && state.finishReason !== null) {
    issues.push("Playing games cannot include a finish reason.");
  }

  return issues;
}

export function assertValidGameState(state: GameState): void {
  const issues = validateGameState(state);

  if (issues.length > 0) {
    throw new Error(issues.join(" "));
  }
}
