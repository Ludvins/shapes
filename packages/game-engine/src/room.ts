import { applyAction, createGame, getPlayerView } from "./game.js";
import { hashSeed } from "./random.js";
import type {
  CreateRoomOptions,
  JoinRoomOptions,
  PlayerView,
  RoomClientView,
  RoomPlayer,
  RoomState,
  StartRoomGameOptions,
  SubmitRoomActionOptions
} from "./types.js";

const ROOM_WORDS = ["CIRCLE", "STAR", "HEX", "FORM", "LINE", "ARC", "GRID", "DOT"];

function cloneRoom(room: RoomState): RoomState {
  return JSON.parse(JSON.stringify(room)) as RoomState;
}

function roomCodeFromSeed(seed: string): string {
  const hash = hashSeed(seed);
  return `${ROOM_WORDS[hash % ROOM_WORDS.length]}-${(hash % 900 + 100).toString()}`;
}

function inviteTokenFromSeed(seed: string): string {
  return hashSeed(`${seed}:invite`).toString(36).padStart(7, "0");
}

function createRoomPlayer(name: string, index: number, now: string): RoomPlayer {
  return {
    id: `room-player-${index + 1}`,
    name: name.trim(),
    connected: true,
    joinedAt: now
  };
}

export function createRoom(options: CreateRoomOptions): RoomState {
  const hostName = options.hostName.trim();

  if (!hostName) {
    throw new Error("A host name is required.");
  }

  const now = options.now ?? new Date().toISOString();
  const seed = options.seed?.trim() || `room-${now}`;
  const host = createRoomPlayer(hostName, 0, now);

  return {
    id: `room-${seed.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    code: roomCodeFromSeed(seed),
    inviteToken: inviteTokenFromSeed(seed),
    seed,
    status: "lobby",
    hostPlayerId: host.id,
    players: [host],
    gameState: null,
    events: [],
    version: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function joinRoom(previousRoom: RoomState, options: JoinRoomOptions): RoomState {
  const room = cloneRoom(previousRoom);
  const playerName = options.playerName.trim();

  if (room.status !== "lobby") {
    throw new Error("Players can only join while the room is in the lobby.");
  }

  if (!playerName) {
    throw new Error("A player name is required.");
  }

  if (room.players.length >= 5) {
    throw new Error("Shapes rooms support up to 5 players.");
  }

  if (room.players.some((player) => player.name.toLowerCase() === playerName.toLowerCase())) {
    throw new Error("That player name is already in the room.");
  }

  const now = options.now ?? new Date().toISOString();
  room.players.push(createRoomPlayer(playerName, room.players.length, now));
  room.version += 1;
  room.updatedAt = now;

  return room;
}

export function startRoomGame(previousRoom: RoomState, options: StartRoomGameOptions): RoomState {
  const room = cloneRoom(previousRoom);

  if (room.status !== "lobby") {
    throw new Error("This room has already started.");
  }

  if (options.hostPlayerId !== room.hostPlayerId) {
    throw new Error("Only the host can start the game.");
  }

  if (room.players.length < 2) {
    throw new Error("At least 2 players are required.");
  }

  const result = createGame({
    playerNames: room.players.map((player) => player.name),
    seed: room.seed
  });

  room.status = "active";
  room.gameState = result.state;
  room.events = [...result.events, ...room.events];
  room.version += 1;
  room.updatedAt = new Date().toISOString();

  return room;
}

export function submitRoomAction(previousRoom: RoomState, options: SubmitRoomActionOptions): RoomState {
  const room = cloneRoom(previousRoom);

  if (room.status !== "active" || !room.gameState) {
    throw new Error("The room does not have an active game.");
  }

  if (room.version !== options.expectedVersion) {
    throw new Error("The room state is stale. Refresh and try again.");
  }

  const actingPlayerExists = room.players.some((player) => player.id.replace("room-", "") === options.action.playerId);

  if (!actingPlayerExists) {
    throw new Error("The acting player is not in this room.");
  }

  const result = applyAction(room.gameState, options.action);
  room.gameState = result.state;
  room.events = [...result.events, ...room.events];
  room.version += 1;
  room.updatedAt = new Date().toISOString();

  if (result.state.phase === "finished") {
    room.status = "finished";
  }

  return room;
}

export function getRoomPlayerView(room: RoomState, roomPlayerId: string, revealAll = false): PlayerView {
  if (!room.gameState) {
    throw new Error("The room does not have a game yet.");
  }

  const playerIndex = room.players.findIndex((player) => player.id === roomPlayerId);

  if (playerIndex === -1) {
    throw new Error("The player is not in this room.");
  }

  return getPlayerView(room.gameState, `player-${playerIndex + 1}`, revealAll);
}

export function getRoomClientView(room: RoomState, roomPlayerId: string | null = null, revealAll = false): RoomClientView {
  const gameView = room.gameState && roomPlayerId ? getRoomPlayerView(room, roomPlayerId, revealAll) : null;

  if (room.gameState && !roomPlayerId) {
    throw new Error("A player id is required for active room views.");
  }

  return {
    id: room.id,
    code: room.code,
    inviteToken: room.inviteToken,
    seed: room.seed,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    players: room.players,
    gameView,
    events: room.events,
    version: room.version,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    viewerRoomPlayerId: roomPlayerId
  };
}
