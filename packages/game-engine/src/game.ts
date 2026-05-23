import { MAX_CRACK_TOKENS, MAX_INSIGHT_TOKENS, SHAPE_FAMILIES } from "./constants.js";
import { createShuffledDeck, selectObjectives } from "./deck.js";
import type {
  ActionResult,
  Blueprints,
  Card,
  ClueMark,
  ClueValue,
  CreateGameOptions,
  GameAction,
  GameEvent,
  GameState,
  HandCard,
  KnownCardInfo,
  Player,
  PlayerView
} from "./types.js";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;

function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function createEmptyBlueprints(): Blueprints {
  return SHAPE_FAMILIES.reduce(
    (blueprints, shape) => ({
      ...blueprints,
      [shape]: []
    }),
    {} as Blueprints
  );
}

function createEvent(
  state: GameState,
  type: GameEvent["type"],
  message: string,
  extras: Partial<GameEvent> = {}
): GameEvent {
  const stableMessageKey = message.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return {
    id: [
      state.id,
      `turn-${state.turn}`,
      type,
      extras.card?.id ?? "state",
      state.deck.length,
      state.discardPile.length,
      state.insightTokens,
      state.crackTokens,
      stableMessageKey
    ].join(":"),
    type,
    turn: state.turn,
    message,
    ...extras
  };
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

function assertCurrentPlayer(state: GameState, playerId: string): Player {
  const player = currentPlayer(state);

  if (state.phase !== "playing") {
    throw new Error("The game is already finished.");
  }

  if (player.id !== playerId) {
    throw new Error(`It is ${player.name}'s turn.`);
  }

  return player;
}

function cardMatchesClue(card: Card, clue: ClueValue): boolean {
  return card[clue.kind] === clue.value;
}

function drawCardToHand(state: GameState, player: Player, events: GameEvent[]): void {
  const card = state.deck.shift();

  if (!card) {
    return;
  }

  player.hand.push({ card, clues: [] });
  events.push(createEvent(state, "card_drawn", `${player.name} drew a replacement card.`, { playerId: player.id }));

  maybeStartFinalRound(state, events);
}

function drawCardToDraft(state: GameState, events: GameEvent[]): void {
  const card = state.deck.shift();

  if (!card) {
    return;
  }

  state.draftRow.push(card);
  events.push(createEvent(state, "card_drawn", "The draft row was replenished."));

  maybeStartFinalRound(state, events);
}

function maybeStartFinalRound(state: GameState, events: GameEvent[]): void {
  if (state.deck.length === 0 && state.finalTurnsRemaining === null) {
    state.finalTurnsRemaining = state.players.length + 1;
    events.push(
      createEvent(
        state,
        "final_round_started",
        "The deck is empty. Each player gets one final turn."
      )
    );
  }
}

function finishGame(state: GameState, reason: GameState["finishReason"], events: GameEvent[]): void {
  state.phase = "finished";
  state.finishReason = reason;
  state.finalTurnsRemaining = 0;
  events.push(createEvent(state, "game_finished", getFinishMessage(reason)));
}

function getFinishMessage(reason: GameState["finishReason"]): string {
  switch (reason) {
    case "cracks":
      return "The third Crack ended the game.";
    case "final-turns":
      return "The final turn was completed.";
    case "perfect-score":
      return "All blueprints are complete.";
    default:
      return "The game is finished.";
  }
}

function advanceTurn(state: GameState, events: GameEvent[]): void {
  if (state.phase === "finished") {
    return;
  }

  if (isPerfectBlueprint(state)) {
    finishGame(state, "perfect-score", events);
    return;
  }

  if (state.finalTurnsRemaining !== null) {
    state.finalTurnsRemaining -= 1;

    if (state.finalTurnsRemaining <= 0) {
      finishGame(state, "final-turns", events);
      return;
    }
  }

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turn += 1;
}

function isPerfectBlueprint(state: GameState): boolean {
  return SHAPE_FAMILIES.every((shape) => state.blueprints[shape].length === 5);
}

function removeActionCard(
  state: GameState,
  player: Player,
  action: Extract<GameAction, { cardIndex: number }>
): HandCard {
  const source = action.source ?? "hand";

  if (source === "draft") {
    if (state.draftRow.length === 0) {
      throw new Error("The draft row is not active in this game.");
    }

    if (action.cardIndex < 0 || action.cardIndex >= state.draftRow.length) {
      throw new Error("That card is not in the draft row.");
    }

    const [card] = state.draftRow.splice(action.cardIndex, 1);
    return { card, clues: [] };
  }

  if (action.cardIndex < 0 || action.cardIndex >= player.hand.length) {
    throw new Error("That card is not in the player's hand.");
  }

  const [handCard] = player.hand.splice(action.cardIndex, 1);
  return handCard;
}

function nextNeededRank(state: GameState, card: Card): number {
  return state.blueprints[card.shape].length + 1;
}

function clueToKnownInfo(clues: ClueMark[]): KnownCardInfo {
  return clues.reduce((known, clue) => {
    if (clue.kind === "shape") {
      return { ...known, shape: clue.value as KnownCardInfo["shape"] };
    }
    if (clue.kind === "rank") {
      return { ...known, rank: clue.value as KnownCardInfo["rank"] };
    }
    return { ...known, pattern: clue.value as KnownCardInfo["pattern"] };
  }, {} as KnownCardInfo);
}

export function createGame(options: CreateGameOptions): ActionResult {
  const playerNames = options.playerNames.map((name) => name.trim()).filter(Boolean);

  if (playerNames.length < MIN_PLAYERS || playerNames.length > MAX_PLAYERS) {
    throw new Error("Shapes supports 2 to 5 players.");
  }

  const seed = options.seed?.trim() || new Date().toISOString();
  const deck = createShuffledDeck(seed);
  const handSize = playerNames.length <= 3 ? 5 : 4;
  const useDraftRow = playerNames.length === 2 && options.useTwoPlayerDraftRow !== false;
  const players = playerNames.map((name, index) => {
    const hand = deck.splice(0, handSize).map((card) => ({ card, clues: [] }));
    return {
      id: `player-${index + 1}`,
      name,
      hand
    };
  });
  const draftRow = useDraftRow ? deck.splice(0, 3) : [];
  const state: GameState = {
    id: `game-${seed.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    seed,
    players,
    draftRow,
    deck,
    discardPile: [],
    blueprints: createEmptyBlueprints(),
    objectives: selectObjectives(seed, options.objectiveCount ?? 2),
    insightTokens: MAX_INSIGHT_TOKENS,
    crackTokens: 0,
    maxInsightTokens: MAX_INSIGHT_TOKENS,
    maxCrackTokens: MAX_CRACK_TOKENS,
    currentPlayerIndex: 0,
    turn: 1,
    phase: "playing",
    finishReason: null,
    finalTurnsRemaining: null
  };
  const events = [
    createEvent(
      state,
      "game_started",
      `New Shapes game started for ${players.length} players.`
    )
  ];

  return { state, events };
}

export function applyAction(previousState: GameState, action: GameAction): ActionResult {
  const state = cloneGameState(previousState);
  const events: GameEvent[] = [];

  switch (action.type) {
    case "GIVE_CLUE": {
      const actor = assertCurrentPlayer(state, action.playerId);

      if (state.insightTokens <= 0) {
        throw new Error("No Insight tokens are available.");
      }

      if (action.targetPlayerId === action.playerId) {
        throw new Error("Players cannot clue their own hand.");
      }

      const target = state.players.find((player) => player.id === action.targetPlayerId);

      if (!target) {
        throw new Error("The target player does not exist.");
      }

      const matchingCards = target.hand.filter((handCard) => cardMatchesClue(handCard.card, action.clue));

      if (matchingCards.length === 0) {
        throw new Error("An Insight must identify at least one card.");
      }

      const clue: ClueMark = {
        id: `${state.id}:clue-${state.turn}-${target.id}-${action.clue.kind}-${action.clue.value}`,
        fromPlayerId: actor.id,
        kind: action.clue.kind,
        value: action.clue.value,
        turn: state.turn
      };

      target.hand.forEach((handCard) => {
        if (cardMatchesClue(handCard.card, action.clue)) {
          handCard.clues.push(clue);
        }
      });

      state.insightTokens -= 1;
      events.push(
        createEvent(
          state,
          "clue_given",
          `${actor.name} told ${target.name} about ${matchingCards.length} ${action.clue.value} card(s).`,
          { playerId: actor.id }
        )
      );
      advanceTurn(state, events);
      return { state, events };
    }
    case "PLAY_CARD": {
      const actor = assertCurrentPlayer(state, action.playerId);
      const source = action.source ?? "hand";
      const handCard = removeActionCard(state, actor, action);
      const neededRank = nextNeededRank(state, handCard.card);

      if (handCard.card.rank === neededRank) {
        state.blueprints[handCard.card.shape].push(handCard.card);
        events.push(
          createEvent(
            state,
            "card_played",
            `${actor.name} played ${formatCard(handCard.card)} successfully.`,
            { playerId: actor.id, card: handCard.card }
          )
        );

        if (handCard.card.rank === 5 && state.insightTokens < state.maxInsightTokens) {
          state.insightTokens += 1;
          events.push(
            createEvent(
              state,
              "insight_recovered",
              `${formatShape(handCard.card.shape)} was completed, recovering 1 Insight.`,
              { playerId: actor.id, card: handCard.card }
            )
          );
        }

        if (isPerfectBlueprint(state)) {
          finishGame(state, "perfect-score", events);
          return { state, events };
        }
      } else {
        state.discardPile.push(handCard.card);
        state.crackTokens += 1;
        events.push(
          createEvent(
            state,
            "card_misplayed",
            `${actor.name} played ${formatCard(handCard.card)}, but ${formatShape(handCard.card.shape)} needed rank ${neededRank}.`,
            { playerId: actor.id, card: handCard.card }
          )
        );

        if (state.crackTokens >= state.maxCrackTokens) {
          finishGame(state, "cracks", events);
          return { state, events };
        }
      }

      if (source === "draft") {
        drawCardToDraft(state, events);
      } else {
        drawCardToHand(state, actor, events);
      }
      advanceTurn(state, events);
      return { state, events };
    }
    case "DISCARD_CARD": {
      const actor = assertCurrentPlayer(state, action.playerId);
      const source = action.source ?? "hand";
      const handCard = removeActionCard(state, actor, action);
      state.discardPile.push(handCard.card);
      events.push(
        createEvent(
          state,
          "card_discarded",
          `${actor.name} discarded ${formatCard(handCard.card)}.`,
          { playerId: actor.id, card: handCard.card }
        )
      );

      if (state.insightTokens < state.maxInsightTokens) {
        state.insightTokens += 1;
        events.push(
          createEvent(
            state,
            "insight_recovered",
            `${actor.name} recovered 1 Insight.`,
            { playerId: actor.id }
          )
        );
      }

      if (source === "draft") {
        drawCardToDraft(state, events);
      } else {
        drawCardToHand(state, actor, events);
      }
      advanceTurn(state, events);
      return { state, events };
    }
    default:
      throw new Error("Unknown action.");
  }
}

export function getPlayerView(state: GameState, viewerPlayerId: string, revealAll = false): PlayerView {
  const current = currentPlayer(state);

  return {
    viewerPlayerId,
    revealAll,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      hand: player.hand.map((handCard) => {
        const isViewerCard = player.id === viewerPlayerId;
        return {
          id: handCard.card.id,
          actual: revealAll || !isViewerCard ? handCard.card : null,
          known: clueToKnownInfo(handCard.clues),
          clues: handCard.clues
        };
      })
    })),
    draftRow: state.draftRow,
    deckCount: state.deck.length,
    discardPile: state.discardPile,
    blueprints: state.blueprints,
    objectives: state.objectives,
    insightTokens: state.insightTokens,
    crackTokens: state.crackTokens,
    maxInsightTokens: state.maxInsightTokens,
    maxCrackTokens: state.maxCrackTokens,
    currentPlayerId: current.id,
    currentPlayerIndex: state.currentPlayerIndex,
    turn: state.turn,
    phase: state.phase,
    finishReason: state.finishReason,
    finalTurnsRemaining: state.finalTurnsRemaining
  };
}

export function getLegalActions(state: GameState, playerId: string): GameAction[] {
  if (state.phase !== "playing" || currentPlayer(state).id !== playerId) {
    return [];
  }

  const actor = currentPlayer(state);
  const actions: GameAction[] = [];

  actor.hand.forEach((_, cardIndex) => {
    actions.push({ type: "PLAY_CARD", playerId, cardIndex });
    actions.push({ type: "DISCARD_CARD", playerId, cardIndex });
  });

  state.draftRow.forEach((_, cardIndex) => {
    actions.push({ type: "PLAY_CARD", playerId, cardIndex, source: "draft" });
    actions.push({ type: "DISCARD_CARD", playerId, cardIndex, source: "draft" });
  });

  if (state.insightTokens > 0) {
    state.players
      .filter((player) => player.id !== playerId)
      .forEach((target) => {
        const seen = new Set<string>();

        target.hand.forEach(({ card }) => {
          const clues: ClueValue[] = [
            { kind: "shape", value: card.shape },
            { kind: "rank", value: card.rank },
            { kind: "pattern", value: card.pattern }
          ];

          clues.forEach((clue) => {
            const key = `${target.id}:${clue.kind}:${clue.value}`;
            if (!seen.has(key)) {
              seen.add(key);
              actions.push({
                type: "GIVE_CLUE",
                playerId,
                targetPlayerId: target.id,
                clue
              });
            }
          });
        });
      });
  }

  return actions;
}

export function formatCard(card: Card): string {
  return `${formatShape(card.shape)} ${card.rank} (${formatPattern(card.pattern)})`;
}

export function formatShape(shape: string): string {
  return shape.charAt(0).toUpperCase() + shape.slice(1);
}

export function formatPattern(pattern: string): string {
  return pattern.charAt(0).toUpperCase() + pattern.slice(1);
}
