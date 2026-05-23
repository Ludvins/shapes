import { describe, expect, it } from "vitest";
import { createDeck } from "./deck";
import { applyAction, createGame, getLegalActions, getPlayerView } from "./game";
import { createRandom } from "./random";
import { createRoom, getRoomClientView, getRoomPlayerView, joinRoom, startRoomGame, submitRoomAction } from "./room";
import { scoreGame } from "./scoring";
import type { GameAction, GameEvent, GameState } from "./types";
import { assertValidGameState, validateGameState } from "./validation";

describe("Shapes game engine", () => {
  it("creates the 50-card deck from the design plan", () => {
    const deck = createDeck();

    expect(deck).toHaveLength(50);
    expect(deck.filter((card) => card.shape === "circle")).toHaveLength(10);
    expect(deck.filter((card) => card.shape === "circle" && card.rank === 1)).toHaveLength(3);
    expect(deck.filter((card) => card.shape === "circle" && card.rank === 5)).toHaveLength(1);
  });

  it("deals five cards in a three-player game", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben", "Cleo"], seed: "deal-test" });

    expect(state.players).toHaveLength(3);
    expect(state.players.every((player) => player.hand.length === 5)).toBe(true);
    expect(state.deck).toHaveLength(35);
  });

  it("adds the recommended draft row in a two-player game", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben"], seed: "draft-test" });

    expect(state.players.every((player) => player.hand.length === 5)).toBe(true);
    expect(state.draftRow).toHaveLength(3);
    expect(state.deck).toHaveLength(37);
  });

  it("applies a formal clue to every matching card", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben"], seed: "clue-test" });
    const actor = state.players[0];
    const target = state.players[1];
    const shape = target.hand[0].card.shape;
    const expectedMatches = target.hand.filter((handCard) => handCard.card.shape === shape).length;
    const result = applyAction(state, {
      type: "GIVE_CLUE",
      playerId: actor.id,
      targetPlayerId: target.id,
      clue: { kind: "shape", value: shape }
    });
    const updatedTarget = result.state.players[1];
    const markedCards = updatedTarget.hand.filter((handCard) =>
      handCard.clues.some((clue) => clue.kind === "shape" && clue.value === shape)
    );

    expect(result.state.insightTokens).toBe(7);
    expect(markedCards).toHaveLength(expectedMatches);
  });

  it("keeps a player's own card identities out of their private view", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben"], seed: "view-test" });
    const view = getPlayerView(state, state.players[0].id, false);

    expect(view.players[0].hand[0].actual).toBeNull();
    expect(view.players[1].hand[0].actual).not.toBeNull();
  });

  it("plays the next needed rank into the matching blueprint", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben"], seed: "play-test" });
    state.players[0].hand[0].card = {
      id: "forced-circle-1",
      shape: "circle",
      rank: 1,
      pattern: "solid"
    };
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: state.players[0].id,
      cardIndex: 0
    });

    expect(result.state.blueprints.circle).toHaveLength(1);
    expect(result.state.discardPile).toHaveLength(0);
    expect(result.state.crackTokens).toBe(0);
  });

  it("can play and replenish the shared draft row", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben"], seed: "draft-play-test" });
    state.draftRow[0] = {
      id: "forced-draft-circle-1",
      shape: "circle",
      rank: 1,
      pattern: "solid"
    };
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: state.players[0].id,
      cardIndex: 0,
      source: "draft"
    });

    expect(result.state.blueprints.circle).toHaveLength(1);
    expect(result.state.draftRow).toHaveLength(3);
    expect(result.state.players[0].hand).toHaveLength(5);
  });

  it("adds a Crack when a played card is not currently placeable", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben"], seed: "misplay-test" });
    state.players[0].hand[0].card = {
      id: "forced-circle-3",
      shape: "circle",
      rank: 3,
      pattern: "striped"
    };
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: state.players[0].id,
      cardIndex: 0
    });

    expect(result.state.blueprints.circle).toHaveLength(0);
    expect(result.state.discardPile).toHaveLength(1);
    expect(result.state.crackTokens).toBe(1);
  });

  it("ends immediately on the third Crack", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben"], seed: "crack-test" });
    state.crackTokens = 2;
    state.players[0].hand[0].card = {
      id: "forced-star-4",
      shape: "star",
      rank: 4,
      pattern: "solid"
    };
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: state.players[0].id,
      cardIndex: 0
    });

    expect(result.state.phase).toBe("finished");
    expect(result.state.finishReason).toBe("cracks");
    expect(result.state.crackTokens).toBe(3);
  });

  it("recovers Insight when rank 5 completes a blueprint", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben"], seed: "rank-five-test" });
    state.insightTokens = 6;
    state.blueprints.circle = [
      { id: "c1", shape: "circle", rank: 1, pattern: "solid" },
      { id: "c2", shape: "circle", rank: 2, pattern: "hollow" },
      { id: "c3", shape: "circle", rank: 3, pattern: "striped" },
      { id: "c4", shape: "circle", rank: 4, pattern: "hollow" }
    ];
    state.players[0].hand[0].card = {
      id: "forced-circle-5",
      shape: "circle",
      rank: 5,
      pattern: "radiant"
    };
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: state.players[0].id,
      cardIndex: 0
    });

    expect(result.state.blueprints.circle).toHaveLength(5);
    expect(result.state.insightTokens).toBe(7);
  });

  it("runs the final round after the deck is exhausted", () => {
    const { state } = createGame({
      playerNames: ["Ada", "Ben"],
      seed: "final-round-test",
      useTwoPlayerDraftRow: false
    });
    state.deck = [{ id: "last-card", shape: "circle", rank: 1, pattern: "solid" }];

    const afterLastDraw = applyAction(state, {
      type: "DISCARD_CARD",
      playerId: state.players[0].id,
      cardIndex: 0
    }).state;

    expect(afterLastDraw.deck).toHaveLength(0);
    expect(afterLastDraw.finalTurnsRemaining).toBe(2);
    expect(afterLastDraw.phase).toBe("playing");

    const afterBen = applyAction(afterLastDraw, {
      type: "DISCARD_CARD",
      playerId: afterLastDraw.players[1].id,
      cardIndex: 0
    }).state;
    const afterAda = applyAction(afterBen, {
      type: "DISCARD_CARD",
      playerId: afterBen.players[0].id,
      cardIndex: 0
    }).state;

    expect(afterAda.phase).toBe("finished");
    expect(afterAda.finishReason).toBe("final-turns");
  });

  it("scores completed ranks and active objectives", () => {
    const { state } = createGame({
      playerNames: ["Ada", "Ben"],
      seed: "score-test",
      objectiveCount: 0
    });
    state.blueprints.circle = [
      { id: "c1", shape: "circle", rank: 1, pattern: "solid" },
      { id: "c2", shape: "circle", rank: 2, pattern: "hollow" },
      { id: "c3", shape: "circle", rank: 3, pattern: "striped" }
    ];
    state.blueprints.square = [
      { id: "s1", shape: "square", rank: 1, pattern: "solid" },
      { id: "s2", shape: "square", rank: 2, pattern: "hollow" }
    ];

    expect(scoreGame(state).baseScore).toBe(5);
  });

  it("validates healthy game states", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben", "Cleo"], seed: "valid-state-test" });

    expect(validateGameState(state)).toEqual([]);
  });

  it("detects duplicate cards across zones", () => {
    const { state } = createGame({ playerNames: ["Ada", "Ben"], seed: "invalid-state-test" });
    state.discardPile.push(state.players[0].hand[0].card);

    expect(validateGameState(state)).toContain("Expected 50 cards across all zones, found 51.");
    expect(validateGameState(state)).toContain("Duplicate card ids found across game zones.");
  });

  it("supports a multiplayer-ready room event log and version check", () => {
    const created = createRoom({ hostName: "Ada", seed: "room-test", now: "2026-05-22T10:00:00.000Z" });
    const joined = joinRoom(created, { playerName: "Ben", now: "2026-05-22T10:01:00.000Z" });
    const started = startRoomGame(joined, { hostPlayerId: joined.hostPlayerId });

    expect(started.status).toBe("active");
    expect(started.version).toBe(2);
    expect(getRoomPlayerView(started, started.players[0].id).players[0].hand[0].actual).toBeNull();
    expect(() =>
      submitRoomAction(started, {
        expectedVersion: started.version - 1,
        action: { type: "DISCARD_CARD", playerId: "player-1", cardIndex: 0 }
      })
    ).toThrow("stale");

    const updated = submitRoomAction(started, {
      expectedVersion: started.version,
      action: { type: "DISCARD_CARD", playerId: "player-1", cardIndex: 0 }
    });

    expect(updated.version).toBe(3);
    expect(updated.events.length).toBeGreaterThan(started.events.length);
  });

  it("supports a complete local playthrough from first clue to game over", () => {
    let state = createGame({ playerNames: ["Ada", "Ben", "Cleo"], seed: "complete-playthrough" }).state;
    const random = createRandom("complete-playthrough-actions");
    const events: GameEvent[] = [];

    const firstPlayerId = state.players[state.currentPlayerIndex].id;
    const firstClue = getLegalActions(state, firstPlayerId).find((action) => action.type === "GIVE_CLUE");

    expect(firstClue).toBeDefined();

    let result = applyAction(state, firstClue as GameAction);
    state = result.state;
    events.push(...result.events);
    assertValidGameState(state);

    const secondPlayerId = state.players[state.currentPlayerIndex].id;
    const firstDiscard = getLegalActions(state, secondPlayerId).find((action) => action.type === "DISCARD_CARD");

    expect(firstDiscard).toBeDefined();

    result = applyAction(state, firstDiscard as GameAction);
    state = result.state;
    events.push(...result.events);

    let steps = 2;

    while (state.phase === "playing" && steps < 400) {
      assertValidGameState(state);
      const playerId = state.players[state.currentPlayerIndex].id;
      const action = chooseSimulationAction(getLegalActions(state, playerId), random);
      result = applyAction(state, action);
      state = result.state;
      events.push(...result.events);
      steps += 1;
    }

    assertValidGameState(state);
    expect(state.phase).toBe("finished");
    expect(events.some((event) => event.type === "clue_given")).toBe(true);
    expect(events.some((event) => event.type === "card_discarded")).toBe(true);
    expect(events.some((event) => event.type === "game_finished")).toBe(true);
    expect(steps).toBeLessThan(400);
  });

  it("smoke tests online room create, join, start, action, and private views", () => {
    const created = createRoom({ hostName: "Ada", seed: "online-smoke", now: "2026-05-22T10:00:00.000Z" });
    const joined = joinRoom(created, { playerName: "Ben", now: "2026-05-22T10:01:00.000Z" });
    const started = startRoomGame(joined, { hostPlayerId: joined.hostPlayerId });

    expect(started.status).toBe("active");
    expect(started.version).toBe(2);
    expect(started.gameState).not.toBeNull();

    const hostView = getRoomPlayerView(started, started.players[0].id);
    const guestView = getRoomPlayerView(started, started.players[1].id);

    expect(hostView.players[0].hand[0].actual).toBeNull();
    expect(hostView.players[1].hand[0].actual).not.toBeNull();
    expect(guestView.players[1].hand[0].actual).toBeNull();
    expect(guestView.players[0].hand[0].actual).not.toBeNull();

    const hostClientView = getRoomClientView(started, started.players[0].id);
    expect(hostClientView.gameView?.players[0].hand[0].actual).toBeNull();
    expect(hostClientView.gameView?.players[1].hand[0].actual).not.toBeNull();
    expect("gameState" in hostClientView).toBe(false);

    const gameState = started.gameState as GameState;
    const playerId = gameState.players[gameState.currentPlayerIndex].id;
    const action = getLegalActions(gameState, playerId).find((candidate) => candidate.type === "DISCARD_CARD");

    expect(action).toBeDefined();

    const updated = submitRoomAction(started, {
      expectedVersion: started.version,
      action: action as GameAction
    });

    expect(updated.version).toBe(3);
    expect(updated.events.length).toBeGreaterThan(started.events.length);
    expect(["active", "finished"]).toContain(updated.status);

    const updatedHostView = getRoomPlayerView(updated, updated.players[0].id);
    expect(updatedHostView.players[0].hand[0].actual).toBeNull();
    expect(updatedHostView.players[1].hand[0].actual).not.toBeNull();
  });

  it("survives randomized legal-action simulations", () => {
    for (let seedIndex = 0; seedIndex < 250; seedIndex += 1) {
      let state = createGame({
        playerNames: ["Ada", "Ben", "Cleo"].slice(0, 2 + (seedIndex % 2)),
        seed: `simulation-${seedIndex}`
      }).state;
      const random = createRandom(`simulation-actions-${seedIndex}`);
      let steps = 0;

      while (state.phase === "playing" && steps < 400) {
        assertValidGameState(state);
        const playerId = state.players[state.currentPlayerIndex].id;
        const legalActions = getLegalActions(state, playerId);
        const action = chooseSimulationAction(legalActions, random);
        state = applyAction(state, action).state;
        steps += 1;
      }

      assertValidGameState(state);
      expect(state.phase).toBe("finished");
      expect(steps).toBeLessThan(400);
    }
  });
});

function chooseSimulationAction(actions: GameAction[], random: () => number): GameAction {
  const cardActions = actions.filter((action) => action.type !== "GIVE_CLUE");
  const clueActions = actions.filter((action) => action.type === "GIVE_CLUE");
  const pool = cardActions.length > 0 && (random() < 0.78 || clueActions.length === 0) ? cardActions : clueActions;
  return pool[Math.floor(random() * pool.length)];
}
