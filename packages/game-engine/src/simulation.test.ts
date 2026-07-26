import { describe, expect, it } from "vitest";
import { applyAction, createGame, getLegalActions } from "./game";
import { createRandom } from "./random";
import { scoreGame } from "./scoring";
import type { Card, GameAction, GameState } from "./types";
import { validateGameState } from "./validation";

type SimulationStrategy = "chaos" | "oracle";
type CardAction = Extract<GameAction, { type: "PLAY_CARD" | "DISCARD_CARD" }>;
type PlayAction = Extract<GameAction, { type: "PLAY_CARD" }>;

const GAMES_PER_CONFIGURATION = 250;
const PLAYER_COUNTS = [2, 3, 4, 5];
const STRATEGIES: SimulationStrategy[] = ["chaos", "oracle"];

interface SimulationSummary {
  games: number;
  averageScore: number;
  averageTurns: number;
  perfectRate: number;
  crackLossRate: number;
  minimumScore: number;
  maximumScore: number;
}

describe("Shapes balance simulation", () => {
  it(
    "finishes thousands of valid games across every player count and strategy",
    () => {
      const rows: Record<string, string | number>[] = [];

      for (const playerCount of PLAYER_COUNTS) {
        for (const strategy of STRATEGIES) {
          const summary = simulateConfiguration(playerCount, strategy, GAMES_PER_CONFIGURATION);
          rows.push({
            players: playerCount,
            strategy,
            games: summary.games,
            "avg score": summary.averageScore.toFixed(2),
            "avg turns": summary.averageTurns.toFixed(1),
            "perfect %": `${summary.perfectRate.toFixed(1)}%`,
            "crack loss %": `${summary.crackLossRate.toFixed(1)}%`,
            range: `${summary.minimumScore}–${summary.maximumScore}`
          });
        }
      }

      console.table(rows);
      expect(rows).toHaveLength(PLAYER_COUNTS.length * STRATEGIES.length);
    },
    60_000
  );
});

function simulateConfiguration(
  playerCount: number,
  strategy: SimulationStrategy,
  games: number
): SimulationSummary {
  let scoreTotal = 0;
  let turnTotal = 0;
  let perfectGames = 0;
  let crackLosses = 0;
  let minimumScore = Number.POSITIVE_INFINITY;
  let maximumScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < games; index += 1) {
    const seed = `balance-${strategy}-${playerCount}-${index}`;
    const random = createRandom(`${seed}-actions`);
    let state = createGame({
      playerNames: Array.from({ length: playerCount }, (_, playerIndex) => `Player ${playerIndex + 1}`),
      seed,
      objectiveCount: 2
    }).state;
    let steps = 0;

    while (state.phase === "playing" && steps < 400) {
      const errors = validateGameState(state);
      if (errors.length > 0) {
        throw new Error(`${seed} became invalid: ${errors.join(" ")}`);
      }

      const playerId = state.players[state.currentPlayerIndex].id;
      const legalActions = getLegalActions(state, playerId);
      const action =
        strategy === "oracle"
          ? chooseOracleAction(state, legalActions, random)
          : chooseChaosAction(legalActions, random);
      state = applyAction(state, action).state;
      steps += 1;
    }

    if (state.phase !== "finished") {
      throw new Error(`${seed} did not finish within 400 actions.`);
    }

    const errors = validateGameState(state);
    if (errors.length > 0) {
      throw new Error(`${seed} finished invalid: ${errors.join(" ")}`);
    }

    const score = scoreGame(state).totalScore;
    scoreTotal += score;
    turnTotal += steps;
    minimumScore = Math.min(minimumScore, score);
    maximumScore = Math.max(maximumScore, score);
    perfectGames += Number(state.finishReason === "perfect-score");
    crackLosses += Number(state.finishReason === "cracks");
  }

  return {
    games,
    averageScore: scoreTotal / games,
    averageTurns: turnTotal / games,
    perfectRate: (perfectGames / games) * 100,
    crackLossRate: (crackLosses / games) * 100,
    minimumScore,
    maximumScore
  };
}

function chooseChaosAction(actions: GameAction[], random: () => number): GameAction {
  const cardActions = actions.filter((action) => action.type !== "GIVE_CLUE");
  const clueActions = actions.filter((action) => action.type === "GIVE_CLUE");
  const useCards = cardActions.length > 0 && (random() < 0.78 || clueActions.length === 0);
  const pool = useCards ? cardActions : clueActions;
  return pool[Math.floor(random() * pool.length)];
}

function chooseOracleAction(state: GameState, actions: GameAction[], random: () => number): GameAction {
  const playable = actions.filter((action): action is PlayAction => {
    if (action.type !== "PLAY_CARD") {
      return false;
    }
    const card = cardForAction(state, action);
    return card.rank === state.blueprints[card.shape].length + 1;
  });

  if (playable.length > 0) {
    playable.sort((left, right) => cardForAction(state, right).rank - cardForAction(state, left).rank);
    return playable[0];
  }

  const safeDiscards = actions.filter((action): action is CardAction => {
    if (action.type !== "DISCARD_CARD") {
      return false;
    }
    const card = cardForAction(state, action);
    return card.rank <= state.blueprints[card.shape].length;
  });

  if (safeDiscards.length > 0) {
    return safeDiscards[Math.floor(random() * safeDiscards.length)];
  }

  const clues = actions.filter((action) => action.type === "GIVE_CLUE");
  if (clues.length > 0 && state.insightTokens > Math.max(1, state.maxInsightTokens / 2)) {
    return clues[Math.floor(random() * clues.length)];
  }

  const discards = actions.filter((action): action is CardAction => action.type === "DISCARD_CARD");
  discards.sort((left, right) => {
    const leftCard = cardForAction(state, left);
    const rightCard = cardForAction(state, right);
    return discardPriority(state, rightCard) - discardPriority(state, leftCard);
  });
  return discards[0] ?? actions[0];
}

function cardForAction(state: GameState, action: CardAction): Card {
  return action.source === "draft"
    ? state.draftRow[action.cardIndex]
    : state.players[state.currentPlayerIndex].hand[action.cardIndex].card;
}

function discardPriority(state: GameState, card: Card): number {
  const progress = state.blueprints[card.shape].length;
  if (card.rank <= progress) {
    return 100 + card.rank;
  }
  return (6 - card.rank) * 4 - Math.max(0, card.rank - progress);
}
