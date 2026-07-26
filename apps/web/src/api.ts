import type { GameAction, PlayerView, RoomClientView } from "@shapes/game-engine";

export const LOCAL_SERVER_URL = "http://127.0.0.1:8787";

export function getDefaultServerUrl(): string {
  const configuredUrl = import.meta.env.VITE_DEFAULT_SERVER_URL as string | undefined;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window === "undefined") {
    return LOCAL_SERVER_URL;
  }

  const { hostname } = window.location;
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
    return LOCAL_SERVER_URL;
  }

  return `http://${hostname}:8787`;
}

export const DEFAULT_SERVER_URL = getDefaultServerUrl();
const REQUEST_TIMEOUT_MS = 20_000;
const SERVER_WAKE_TIMEOUT_MS = 90_000;
const SERVER_READY_TTL_MS = 60_000;
const MIN_ROOM_PLAYERS = 2;
const MAX_ROOM_PLAYERS = 5;
const serverWakeRequests = new Map<string, Promise<void>>();
const serverReadyUntil = new Map<string, number>();
const rememberedRoomSizes = new Map<string, number>();

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function wakeServer(baseUrl: string): Promise<void> {
  const deadline = Date.now() + SERVER_WAKE_TIMEOUT_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    const controller = new AbortController();
    const remainingTime = deadline - Date.now();
    const timeout = window.setTimeout(() => controller.abort(), Math.min(15_000, remainingTime));

    try {
      const response = await fetch(`${baseUrl}/health`, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal
      });

      if (response.ok) {
        return;
      }

      if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) {
        throw new Error(`The Shapes server health check failed with ${response.status}.`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("The Shapes server health check")) {
        throw error;
      }
      // Render can briefly reset or reject requests while a sleeping service boots.
    } finally {
      window.clearTimeout(timeout);
    }

    const retryDelay = Math.min(attempt * 1_000, 5_000, Math.max(0, deadline - Date.now()));
    if (retryDelay > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, retryDelay));
    }
  }

  throw new Error("The game server is still waking up. Please wait a moment, then try again.");
}

export function prepareOnlineServer(baseUrl: string): Promise<void> {
  const trimmedBaseUrl = trimBaseUrl(baseUrl);

  if ((serverReadyUntil.get(trimmedBaseUrl) ?? 0) > Date.now()) {
    return Promise.resolve();
  }

  const pendingRequest = serverWakeRequests.get(trimmedBaseUrl);
  if (pendingRequest) {
    return pendingRequest;
  }

  const wakeRequest = wakeServer(trimmedBaseUrl)
    .then(() => {
      serverReadyUntil.set(trimmedBaseUrl, Date.now() + SERVER_READY_TTL_MS);
    })
    .finally(() => {
      serverWakeRequests.delete(trimmedBaseUrl);
    });

  serverWakeRequests.set(trimmedBaseUrl, wakeRequest);
  return wakeRequest;
}

function validRoomSize(value: unknown): number | null {
  const size = Number(value);
  return Number.isInteger(size) && size >= MIN_ROOM_PLAYERS && size <= MAX_ROOM_PLAYERS ? size : null;
}

function normalizeRoomView(room: RoomClientView, requestedSize?: number): RoomClientView {
  const serverRoomSize = validRoomSize(room.expectedPlayerCount);
  const minimumVisibleSize = Math.min(MAX_ROOM_PLAYERS, Math.max(MIN_ROOM_PLAYERS, room.players.length));
  const roomSize =
    serverRoomSize ??
    Math.max(validRoomSize(requestedSize) ?? 0, rememberedRoomSizes.get(room.id) ?? 0, minimumVisibleSize);

  rememberedRoomSizes.set(room.id, roomSize);
  return room.expectedPlayerCount === roomSize ? room : { ...room, expectedPlayerCount: roomSize };
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const trimmedBaseUrl = trimBaseUrl(baseUrl);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${trimmedBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...init?.headers
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `The Shapes server at ${trimmedBaseUrl} did not respond within 20 seconds. If this is a Render free service, open ${trimmedBaseUrl}/health and wait for it to wake up, or check the Render deploy logs.`
      );
    }

    throw new Error(`Could not reach the Shapes server at ${trimmedBaseUrl}. Check that the server is running and the URL is reachable.`);
  } finally {
    window.clearTimeout(timeout);
  }

  const body = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

export function createOnlineRoom(
  baseUrl: string,
  body: { hostName: string; expectedPlayerCount: number; seed?: string }
): Promise<RoomClientView> {
  return requestJson<RoomClientView>(baseUrl, "/rooms", {
    method: "POST",
    body: JSON.stringify(body)
  }).then((room) => normalizeRoomView(room, body.expectedPlayerCount));
}

export function joinOnlineRoom(baseUrl: string, roomId: string, body: { playerName: string }): Promise<RoomClientView> {
  return requestJson<RoomClientView>(baseUrl, `/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify(body)
  }).then((room) => normalizeRoomView(room));
}

export function getOnlineRoom(
  baseUrl: string,
  roomId: string,
  playerId: string,
  revealAll = false
): Promise<RoomClientView> {
  return requestJson<RoomClientView>(
    baseUrl,
    `/rooms/${roomId}?playerId=${encodeURIComponent(playerId)}&revealAll=${String(revealAll)}`
  ).then((room) => normalizeRoomView(room));
}

export function startOnlineRoom(baseUrl: string, roomId: string, body: { hostPlayerId: string }): Promise<RoomClientView> {
  return requestJson<RoomClientView>(baseUrl, `/rooms/${roomId}/start`, {
    method: "POST",
    body: JSON.stringify(body)
  }).then((room) => normalizeRoomView(room));
}

export function submitOnlineAction(
  baseUrl: string,
  roomId: string,
  body: { expectedVersion: number; roomPlayerId: string; action: GameAction }
): Promise<RoomClientView> {
  return requestJson<RoomClientView>(baseUrl, `/rooms/${roomId}/actions`, {
    method: "POST",
    body: JSON.stringify(body)
  }).then((room) => normalizeRoomView(room));
}

export function getOnlinePlayerView(
  baseUrl: string,
  roomId: string,
  playerId: string,
  revealAll = false
): Promise<PlayerView> {
  return requestJson<PlayerView>(
    baseUrl,
    `/rooms/${roomId}/view?playerId=${encodeURIComponent(playerId)}&revealAll=${String(revealAll)}`
  );
}

export function subscribeToOnlineRoom(
  baseUrl: string,
  roomId: string,
  playerId: string,
  revealAll: boolean,
  onRoom: (room: RoomClientView) => void,
  onError: (message: string) => void
): () => void {
  const events = new EventSource(
    `${trimBaseUrl(baseUrl)}/rooms/${roomId}/events?playerId=${encodeURIComponent(playerId)}&revealAll=${String(revealAll)}`
  );

  events.addEventListener("room", (event) => {
    onRoom(normalizeRoomView(JSON.parse(event.data) as RoomClientView));
  });
  events.onerror = () => {
    onError("Lost server event stream. The room will refresh after the next action.");
  };

  return () => events.close();
}
