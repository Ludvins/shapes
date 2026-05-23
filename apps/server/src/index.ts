import {
  createRoom,
  getRoomClientView,
  getRoomPlayerView,
  joinRoom,
  startRoomGame,
  submitRoomAction,
  type GameAction,
  type RoomState
} from "@shapes/game-engine";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8787);
const roomsFile = resolve(process.env.SHAPES_ROOMS_FILE ?? "data/rooms.json");
const rooms = new Map<string, RoomState>();
const streams = new Map<string, Set<RoomStream>>();

interface RouteMatch {
  roomId?: string;
  action?: "join" | "start" | "actions" | "view" | "events";
}

interface RoomStream {
  response: ServerResponse;
  roomPlayerId: string;
  revealAll: boolean;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendError(response: ServerResponse, status: number, message: string): void {
  sendJson(response, status, { error: message });
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function parseRoute(pathname: string): RouteMatch | null {
  if (pathname === "/health") {
    return {};
  }

  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] !== "rooms") {
    return null;
  }

  if (parts.length === 1) {
    return {};
  }

  if (parts.length === 2) {
    return { roomId: parts[1] };
  }

  if (parts.length === 3 && ["join", "start", "actions", "view", "events"].includes(parts[2])) {
    return { roomId: parts[1], action: parts[2] as RouteMatch["action"] };
  }

  return null;
}

function loadRooms(): void {
  if (!existsSync(roomsFile)) {
    return;
  }

  const parsed = JSON.parse(readFileSync(roomsFile, "utf8")) as RoomState[];
  parsed.forEach((room) => rooms.set(room.id, room));
}

function persistRooms(): void {
  mkdirSync(dirname(roomsFile), { recursive: true });
  const temporaryFile = `${roomsFile}.tmp`;
  writeFileSync(temporaryFile, JSON.stringify([...rooms.values()], null, 2));
  renameSync(temporaryFile, roomsFile);
}

function publishRoom(room: RoomState): void {
  const roomStreams = streams.get(room.id);

  if (!roomStreams) {
    return;
  }

  roomStreams.forEach((stream) => {
    const view = getRoomClientView(room, stream.roomPlayerId, stream.revealAll);
    stream.response.write(`event: room\ndata: ${JSON.stringify(view)}\n\n`);
  });
}

function storeRoom(room: RoomState): RoomState {
  rooms.set(room.id, room);
  persistRooms();
  publishRoom(room);
  return room;
}

function getRoomOrThrow(roomId: string | undefined): RoomState {
  if (!roomId) {
    throw new Error("Room id is required.");
  }

  const room =
    rooms.get(roomId) ??
    [...rooms.values()].find(
      (candidate) =>
        candidate.code.toLowerCase() === roomId.toLowerCase() ||
        candidate.inviteToken.toLowerCase() === roomId.toLowerCase()
    );

  if (!room) {
    throw new Error("Room not found.");
  }

  return room;
}

function openEventStream(room: RoomState, roomPlayerId: string, revealAll: boolean, response: ServerResponse): void {
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "cache-control": "no-cache",
    "connection": "keep-alive",
    "content-type": "text/event-stream; charset=utf-8"
  });
  response.write(`event: room\ndata: ${JSON.stringify(getRoomClientView(room, roomPlayerId, revealAll))}\n\n`);

  const roomStreams = streams.get(room.id) ?? new Set<RoomStream>();
  const stream = { response, roomPlayerId, revealAll };
  roomStreams.add(stream);
  streams.set(room.id, roomStreams);

  response.on("close", () => {
    roomStreams.delete(stream);
    if (roomStreams.size === 0) {
      streams.delete(room.id);
    }
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const route = parseRoute(url.pathname);

  if (!route) {
    sendError(response, 404, "Not found.");
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, { ok: true, rooms: rooms.size, persistence: roomsFile });
    return;
  }

  if (request.method === "POST" && url.pathname === "/rooms") {
    const body = await readJson<{ hostName?: string; seed?: string }>(request);
    const room = createRoom({ hostName: body.hostName ?? "", seed: body.seed });
    sendJson(response, 201, getRoomClientView(storeRoom(room), room.hostPlayerId));
    return;
  }

  const room = getRoomOrThrow(route.roomId);

  if (request.method === "GET" && route.action === undefined) {
    const roomPlayerId = url.searchParams.get("playerId");
    const revealAll = url.searchParams.get("revealAll") === "true";
    sendJson(response, 200, getRoomClientView(room, roomPlayerId, revealAll));
    return;
  }

  if (request.method === "GET" && route.action === "events") {
    const roomPlayerId = url.searchParams.get("playerId");
    const revealAll = url.searchParams.get("revealAll") === "true";

    if (!roomPlayerId) {
      sendError(response, 400, "playerId is required for room events.");
      return;
    }

    openEventStream(room, roomPlayerId, revealAll, response);
    return;
  }

  if (request.method === "GET" && route.action === "view") {
    const roomPlayerId = url.searchParams.get("playerId") ?? "";
    const revealAll = url.searchParams.get("revealAll") === "true";
    sendJson(response, 200, getRoomPlayerView(room, roomPlayerId, revealAll));
    return;
  }

  if (request.method === "POST" && route.action === "join") {
    const body = await readJson<{ playerName?: string }>(request);
    const updatedRoom = storeRoom(joinRoom(room, { playerName: body.playerName ?? "" }));
    const joinedPlayer = updatedRoom.players[updatedRoom.players.length - 1];
    sendJson(response, 200, getRoomClientView(updatedRoom, joinedPlayer.id));
    return;
  }

  if (request.method === "POST" && route.action === "start") {
    const body = await readJson<{ hostPlayerId?: string }>(request);
    const hostPlayerId = body.hostPlayerId ?? "";
    sendJson(response, 200, getRoomClientView(storeRoom(startRoomGame(room, { hostPlayerId })), hostPlayerId));
    return;
  }

  if (request.method === "POST" && route.action === "actions") {
    const body = await readJson<{ expectedVersion?: number; action?: GameAction; roomPlayerId?: string }>(request);

    if (!body.action || typeof body.expectedVersion !== "number") {
      sendError(response, 400, "expectedVersion and action are required.");
      return;
    }

    const roomPlayerId = body.roomPlayerId ?? body.action.playerId.replace("player-", "room-player-");

    sendJson(
      response,
      200,
      getRoomClientView(
        storeRoom(
          submitRoomAction(room, {
            expectedVersion: body.expectedVersion,
            action: body.action
          })
        ),
        roomPlayerId
      )
    );
    return;
  }

  sendError(response, 405, "Method not allowed.");
}

loadRooms();

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error: unknown) => {
    sendError(response, 400, error instanceof Error ? error.message : "Request failed.");
  });
});

server.listen(port, host, () => {
  console.log(`Shapes server listening at http://${host}:${port}`);
  console.log(`Shapes room persistence file: ${roomsFile}`);
});
