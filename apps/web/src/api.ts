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

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
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

export function createOnlineRoom(baseUrl: string, body: { hostName: string; seed?: string }): Promise<RoomClientView> {
  return requestJson<RoomClientView>(baseUrl, "/rooms", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function joinOnlineRoom(baseUrl: string, roomId: string, body: { playerName: string }): Promise<RoomClientView> {
  return requestJson<RoomClientView>(baseUrl, `/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify(body)
  });
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
  );
}

export function startOnlineRoom(baseUrl: string, roomId: string, body: { hostPlayerId: string }): Promise<RoomClientView> {
  return requestJson<RoomClientView>(baseUrl, `/rooms/${roomId}/start`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function submitOnlineAction(
  baseUrl: string,
  roomId: string,
  body: { expectedVersion: number; roomPlayerId: string; action: GameAction }
): Promise<RoomClientView> {
  return requestJson<RoomClientView>(baseUrl, `/rooms/${roomId}/actions`, {
    method: "POST",
    body: JSON.stringify(body)
  });
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
    onRoom(JSON.parse(event.data) as RoomClientView);
  });
  events.onerror = () => {
    onError("Lost server event stream. The room will refresh after the next action.");
  };

  return () => events.close();
}
