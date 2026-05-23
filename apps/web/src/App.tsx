import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  RANKS,
  SHAPE_FAMILIES,
  applyAction,
  createDeck,
  createGame,
  formatPattern,
  formatShape,
  getLegalActions,
  scoreGame,
  type Card,
  type ClueMark,
  type ClueValue,
  type GameAction,
  type GameEvent,
  type GameState,
  type HandCard,
  type Pattern,
  type Player,
  type PlayerView,
  type Rank,
  type RoomClientView,
  type ShapeFamily
} from "@shapes/game-engine";
import {
  DEFAULT_SERVER_URL,
  createOnlineRoom,
  getOnlineRoom,
  joinOnlineRoom,
  startOnlineRoom,
  submitOnlineAction,
  subscribeToOnlineRoom
} from "./api";

const DEFAULT_NAMES = ["Ada", "Ben", "Cleo", "Dina", "Ezra"];
const PATTERN_ORDER: Pattern[] = ["solid", "striped", "dotted", "hollow", "radiant"];
const LOCAL_SAVE_KEY = "shapes.local-prototype.v2";

interface VisualPalette {
  main: string;
  dark: string;
  light: string;
  soft: string;
  glow: string;
}

const SHAPE_PALETTES: Record<ShapeFamily, VisualPalette> = {
  circle: { main: "#2f76c9", dark: "#1e4f8c", light: "#8ec4ff", soft: "#ddecff", glow: "#65b6ff" },
  triangle: { main: "#cf513f", dark: "#8d3024", light: "#ff9a86", soft: "#ffe2dc", glow: "#ff8069" },
  square: { main: "#4f7e3c", dark: "#315426", light: "#9dd37c", soft: "#e4f3dc", glow: "#86c96f" },
  star: { main: "#c39027", dark: "#7e5b13", light: "#ffd76b", soft: "#fff0cf", glow: "#ffcf4d" },
  hexagon: { main: "#7250b5", dark: "#472f7d", light: "#b59bff", soft: "#ece4ff", glow: "#a88bff" }
};

const PATTERN_PALETTE: VisualPalette = {
  main: "#13746d",
  dark: "#0a3f3b",
  light: "#77d7cc",
  soft: "#dff3f0",
  glow: "#4cc8bb"
};

type AppMode = "local" | "online";
type GameSetup = { state: GameState; events: GameEvent[] };
type FilterValue<T extends string | number> = "all" | T;
type TableFocus = "deck" | "discard" | "objectives";
type OnlineBusyState = "idle" | "creating" | "joining" | "starting" | "refreshing";
type CardSelection = { playerId: string; cardIndex: number; source: "hand" | "draft" } | null;
type CluePreview = { targetPlayerId: string; clue: ClueValue } | null;
type FeedbackKind = "started" | "played" | "discarded" | "misplayed" | "drawn" | "clue" | "final" | "finished";
type FeedbackCue = FeedbackKind | "turn";

interface TableFeedback {
  id: number;
  kind: FeedbackKind;
  card?: Card;
}

interface TurnNotice {
  id: number;
  playerName: string;
}

interface DiscardFilters {
  shape: FilterValue<ShapeFamily>;
  rank: FilterValue<Rank>;
  pattern: FilterValue<Pattern>;
}

interface SavedSession {
  version: 2;
  playerCount: number;
  seed: string;
  setup: GameSetup;
  events: GameEvent[];
  revealAll: boolean;
  viewerPlayerId: string;
  followTurn: boolean;
  discardFilters: DiscardFilters;
}

interface ClueEntry {
  id: string;
  turn: number;
  fromName: string;
  targetName: string;
  clue: ClueValue;
  count: number;
}

const EMPTY_DISCARD_FILTERS: DiscardFilters = {
  shape: "all",
  rank: "all",
  pattern: "all"
};

const savedSession = loadSavedSession();
const SOUND_SAVE_KEY = "shapes.sound-enabled.v1";
let feedbackAudioContext: AudioContext | null = null;

function newSeed(): string {
  return `local-${Date.now().toString(36)}`;
}

function startLocalGame(playerCount: number, seed = newSeed()): GameSetup {
  return createGame({
    playerNames: DEFAULT_NAMES.slice(0, playerCount),
    seed,
    objectiveCount: 2
  });
}

interface InviteParams {
  serverUrl: string;
  roomId: string;
}

function readInviteParams(): InviteParams | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room");
  if (!roomId) {
    return null;
  }

  return {
    serverUrl: params.get("server") || DEFAULT_SERVER_URL,
    roomId
  };
}

function buildInviteLink(serverUrl: string, roomId: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("mode", "online");
  url.searchParams.set("server", serverUrl);
  url.searchParams.set("room", roomId);
  return url.toString();
}

function enginePlayerIdForRoom(room: RoomClientView, roomPlayerId: string): string | null {
  const playerIndex = room.players.findIndex((player) => player.id === roomPlayerId);
  return playerIndex === -1 ? null : `player-${playerIndex + 1}`;
}

function hiddenPlaceholderCard(id: string): Card {
  return {
    id,
    shape: "circle",
    rank: 1,
    pattern: "solid"
  };
}

function gameStateFromPlayerView(view: PlayerView, seed: string): GameState {
  return {
    id: `online-view-${seed}`,
    seed,
    players: view.players.map((player) => ({
      id: player.id,
      name: player.name,
      hand: player.hand.map((visibleCard) => ({
        card: visibleCard.actual ?? hiddenPlaceholderCard(visibleCard.id),
        clues: visibleCard.clues
      }))
    })),
    draftRow: view.draftRow,
    deck: Array.from({ length: view.deckCount }, (_, index) => hiddenPlaceholderCard(`deck-hidden-${index}`)),
    discardPile: view.discardPile,
    blueprints: view.blueprints,
    objectives: view.objectives,
    insightTokens: view.insightTokens,
    crackTokens: view.crackTokens,
    maxInsightTokens: view.maxInsightTokens,
    maxCrackTokens: view.maxCrackTokens,
    currentPlayerIndex: view.currentPlayerIndex,
    turn: view.turn,
    phase: view.phase,
    finishReason: view.finishReason,
    finalTurnsRemaining: view.finalTurnsRemaining
  };
}

function loadSavedSession(): SavedSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as SavedSession;
    if (
      parsed.version !== 2 ||
      !parsed.setup?.state ||
      !Array.isArray(parsed.setup.state.players) ||
      !Array.isArray(parsed.setup.state.draftRow)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function loadSoundEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(SOUND_SAVE_KEY) !== "false";
}

function getFeedbackAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (feedbackAudioContext) {
    return feedbackAudioContext;
  }

  const AudioContextConstructor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  feedbackAudioContext = new AudioContextConstructor();
  return feedbackAudioContext;
}

function armFeedbackAudio(): boolean {
  const context = getFeedbackAudioContext();

  if (!context) {
    return false;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  return true;
}

function playTone(
  context: AudioContext,
  time: number,
  frequency: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = "sine"
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.02);
}

function playFeedbackCue(cue: FeedbackCue, enabled: boolean): void {
  if (!enabled) {
    return;
  }

  const context = getFeedbackAudioContext();

  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  const now = context.currentTime + 0.012;
  const gain = 0.035;

  switch (cue) {
    case "turn":
      playTone(context, now, 392, 0.11, gain, "triangle");
      playTone(context, now + 0.11, 523.25, 0.14, gain, "triangle");
      break;
    case "started":
      playTone(context, now, 329.63, 0.1, gain, "sine");
      playTone(context, now + 0.08, 415.3, 0.12, gain, "sine");
      playTone(context, now + 0.16, 493.88, 0.14, gain, "sine");
      break;
    case "played":
      playTone(context, now, 523.25, 0.1, gain, "triangle");
      playTone(context, now + 0.08, 659.25, 0.13, gain, "triangle");
      break;
    case "discarded":
      playTone(context, now, 220, 0.09, gain * 0.8, "square");
      playTone(context, now + 0.06, 164.81, 0.12, gain * 0.75, "square");
      break;
    case "misplayed":
      playTone(context, now, 196, 0.16, gain * 0.85, "sawtooth");
      playTone(context, now + 0.08, 146.83, 0.18, gain * 0.75, "sawtooth");
      break;
    case "clue":
      playTone(context, now, 698.46, 0.08, gain * 0.75, "sine");
      playTone(context, now + 0.07, 783.99, 0.08, gain * 0.75, "sine");
      break;
    case "drawn":
      playTone(context, now, 293.66, 0.08, gain * 0.7, "triangle");
      break;
    case "final":
      playTone(context, now, 392, 0.13, gain, "triangle");
      playTone(context, now + 0.11, 349.23, 0.15, gain, "triangle");
      playTone(context, now + 0.22, 293.66, 0.18, gain, "triangle");
      break;
    case "finished":
      playTone(context, now, 261.63, 0.16, gain, "sine");
      playTone(context, now + 0.13, 329.63, 0.16, gain, "sine");
      playTone(context, now + 0.26, 392, 0.22, gain, "sine");
      break;
  }
}

export function App() {
  const inviteParams = useMemo(() => readInviteParams(), []);
  const [mode, setMode] = useState<AppMode>(inviteParams ? "online" : "local");
  const [playerCount, setPlayerCount] = useState(savedSession?.playerCount ?? 3);
  const [seed, setSeed] = useState(savedSession?.seed ?? "first-build");
  const [setup, setSetup] = useState<GameSetup>(() => savedSession?.setup ?? startLocalGame(3, "first-build"));
  const [events, setEvents] = useState<GameEvent[]>(() => savedSession?.events ?? setup.events);
  const [revealAll, setRevealAll] = useState(false);
  const [followTurn, setFollowTurn] = useState(savedSession?.followTurn ?? true);
  const [viewerPlayerId, setViewerPlayerId] = useState(
    savedSession?.viewerPlayerId ?? setup.state.players[setup.state.currentPlayerIndex].id
  );
  const [discardFilters, setDiscardFilters] = useState<DiscardFilters>(
    savedSession?.discardFilters ?? EMPTY_DISCARD_FILTERS
  );
  const [serverUrl, setServerUrl] = useState(inviteParams?.serverUrl ?? DEFAULT_SERVER_URL);
  const [onlineName, setOnlineName] = useState("Ada");
  const [onlineJoinRoomId, setOnlineJoinRoomId] = useState(inviteParams?.roomId ?? "");
  const [onlineRoom, setOnlineRoom] = useState<RoomClientView | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState("");
  const [onlineBusy, setOnlineBusy] = useState<OnlineBusyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tableFocus, setTableFocus] = useState<TableFocus>("objectives");
  const [selectedCard, setSelectedCard] = useState<CardSelection>(null);
  const [cluePreview, setCluePreview] = useState<CluePreview>(null);
  const [tableFeedback, setTableFeedback] = useState<TableFeedback | null>(null);
  const [turnNotice, setTurnNotice] = useState<TurnNotice | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(loadSoundEnabled);
  const [soundReady, setSoundReady] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const lastEventSignature = useRef("");
  const lastTurnNoticeKey = useRef("");
  const onlineState = useMemo(() => {
    return onlineRoom?.gameView ? gameStateFromPlayerView(onlineRoom.gameView, onlineRoom.seed) : null;
  }, [onlineRoom?.gameView, onlineRoom?.seed]);
  const activeState = mode === "online" ? onlineState : setup.state;
  const state = activeState ?? setup.state;
  const hasActiveGame = mode === "local" || Boolean(onlineRoom?.gameView);
  const currentPlayer = state.players[state.currentPlayerIndex];
  const onlineEnginePlayerId = onlineRoom ? enginePlayerIdForRoom(onlineRoom, onlinePlayerId) : null;
  const activeViewerPlayerId = mode === "online" && onlineEnginePlayerId ? onlineEnginePlayerId : viewerPlayerId;
  const viewer = state.players.find((player) => player.id === activeViewerPlayerId) ?? currentPlayer;
  const legalActions = useMemo(() => {
    if (mode === "online" && onlineEnginePlayerId !== currentPlayer.id) {
      return [];
    }

    return getLegalActions(state, currentPlayer.id);
  }, [currentPlayer.id, mode, onlineEnginePlayerId, state]);
  const canActForCurrentPlayer = mode === "local" || onlineEnginePlayerId === currentPlayer.id;
  const isViewerTurn =
    state.phase === "playing" &&
    (mode === "online" ? onlineEnginePlayerId === currentPlayer.id : viewer.id === currentPlayer.id);
  const clueHistory = useMemo(() => collectClueHistory(state), [state]);
  const filteredDiscards = useMemo(
    () => filterDiscards(state.discardPile, discardFilters),
    [discardFilters, state.discardPile]
  );
  const activeEvents = mode === "online" && onlineRoom ? onlineRoom.events : events;

  useEffect(() => {
    if (mode !== "local") {
      return;
    }

    if (!state.players.some((player) => player.id === viewerPlayerId)) {
      setViewerPlayerId(currentPlayer.id);
    }
  }, [currentPlayer.id, mode, state.players, viewerPlayerId]);

  useEffect(() => {
    if (mode !== "local" || !followTurn) {
      return;
    }

    setViewerPlayerId(currentPlayer.id);
  }, [currentPlayer.id, followTurn, mode]);

  useEffect(() => {
    const session: SavedSession = {
      version: 2,
      playerCount,
      seed,
      setup,
      events,
      revealAll,
      viewerPlayerId,
      followTurn,
      discardFilters
    };

    window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(session));
  }, [discardFilters, events, followTurn, playerCount, revealAll, seed, setup, viewerPlayerId]);

  useEffect(() => {
    window.localStorage.setItem(SOUND_SAVE_KEY, String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) {
      setSoundReady(false);
      return;
    }

    const arm = () => {
      setSoundReady(armFeedbackAudio());
    };

    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [soundEnabled]);

  useEffect(() => {
    if (mode !== "online" || !onlineRoom || !onlinePlayerId) {
      return;
    }

    return subscribeToOnlineRoom(serverUrl, onlineRoom.id, onlinePlayerId, revealAll, setOnlineRoom, setError);
  }, [mode, onlinePlayerId, onlineRoom?.id, revealAll, serverUrl]);

  useEffect(() => {
    setSelectedCard(null);
  }, [state.phase, state.turn]);

  useEffect(() => {
    if (!hasActiveGame || activeEvents.length === 0) {
      return;
    }

    const signature = activeEvents.slice(0, 4).map((event) => event.id).join("|");

    if (!signature || signature === lastEventSignature.current) {
      return;
    }

    const previousSignature = lastEventSignature.current;
    lastEventSignature.current = signature;

    if (!previousSignature && state.turn > 1) {
      return;
    }

    const feedback = feedbackFromEvents(activeEvents);
    if (feedback) {
      setTableFeedback(feedback);
      playFeedbackCue(feedback.kind, soundEnabled);
    }
  }, [activeEvents, hasActiveGame, soundEnabled, state.turn]);

  useEffect(() => {
    if (!hasActiveGame || state.phase !== "playing") {
      return;
    }

    const turnKey = `${state.id}:${state.turn}:${currentPlayer.id}:${viewer.id}:${onlinePlayerId}`;
    if (turnKey === lastTurnNoticeKey.current) {
      return;
    }

    lastTurnNoticeKey.current = turnKey;

    if (!isViewerTurn) {
      return;
    }

    setTurnNotice({ id: Date.now(), playerName: currentPlayer.name });
    playFeedbackCue("turn", soundEnabled);
  }, [
    currentPlayer.id,
    currentPlayer.name,
    hasActiveGame,
    isViewerTurn,
    onlinePlayerId,
    soundEnabled,
    state.id,
    state.phase,
    state.turn,
    viewer.id
  ]);

  useEffect(() => {
    if (!tableFeedback) {
      return;
    }

    const timeout = window.setTimeout(() => setTableFeedback(null), 850);
    return () => window.clearTimeout(timeout);
  }, [tableFeedback]);

  useEffect(() => {
    if (!turnNotice) {
      return;
    }

    const timeout = window.setTimeout(() => setTurnNotice(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [turnNotice]);

  function changeMode(nextMode: AppMode) {
    setMode(nextMode);
    setOnlineBusy("idle");
    setSelectedCard(null);
    setCluePreview(null);
    setError(null);
  }

  function resetGame(nextSeed = seed) {
    const next = startLocalGame(playerCount, nextSeed || newSeed());
    setSetup(next);
    setEvents(next.events);
    setViewerPlayerId(next.state.players[0].id);
    setSelectedCard(null);
    setCluePreview(null);
    setTableFocus("objectives");
    setError(null);
  }

  async function createRoom() {
    if (onlineBusy !== "idle") {
      return;
    }

    setOnlineBusy("creating");
    try {
      const room = await createOnlineRoom(serverUrl, {
        hostName: onlineName.trim() || "Player",
        seed: seed.trim() || undefined
      });
      setOnlineRoom(room);
      setOnlinePlayerId(room.viewerRoomPlayerId ?? room.hostPlayerId);
      setOnlineJoinRoomId(room.code);
      setSelectedCard(null);
      setCluePreview(null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create room.");
    } finally {
      setOnlineBusy("idle");
    }
  }

  async function joinRoom() {
    if (onlineBusy !== "idle") {
      return;
    }

    setOnlineBusy("joining");
    try {
      const name = onlineName.trim() || "Player";
      const room = await joinOnlineRoom(serverUrl, onlineJoinRoomId.trim(), { playerName: name });
      const joinedPlayer =
        room.players.find((player) => player.id === room.viewerRoomPlayerId) ??
        room.players.find((player) => player.name === name) ??
        room.players[room.players.length - 1];
      setOnlineRoom(room);
      setOnlinePlayerId(joinedPlayer.id);
      setSelectedCard(null);
      setCluePreview(null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join room.");
    } finally {
      setOnlineBusy("idle");
    }
  }

  async function startRoom() {
    if (!onlineRoom) {
      return;
    }

    setOnlineBusy("starting");
    try {
      setOnlineRoom(await startOnlineRoom(serverUrl, onlineRoom.id, { hostPlayerId: onlinePlayerId }));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start room.");
    } finally {
      setOnlineBusy("idle");
    }
  }

  async function refreshRoom() {
    if (!onlineRoom) {
      return;
    }

    setOnlineBusy("refreshing");
    try {
      setOnlineRoom(await getOnlineRoom(serverUrl, onlineRoom.id, onlinePlayerId, revealAll));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh room.");
    } finally {
      setOnlineBusy("idle");
    }
  }

  async function perform(action: GameAction) {
    try {
      if (mode === "online") {
        if (!onlineRoom) {
          throw new Error("No online room is active.");
        }

        const room = await submitOnlineAction(serverUrl, onlineRoom.id, {
            expectedVersion: onlineRoom.version,
            roomPlayerId: onlinePlayerId,
            action
          });
        setOnlineRoom(room);
        setTableFeedback(feedbackFromEvents(room.events));
        setSelectedCard(null);
        setError(null);
        return;
      }

      const result = applyAction(state, action);
      setSetup({ state: result.state, events: result.events });
      setEvents((previous) => [...result.events, ...previous].slice(0, 90));
      setTableFeedback(feedbackFromEvents(result.events));
      setSelectedCard(null);

      if (followTurn && result.state.phase === "playing") {
        setViewerPlayerId(result.state.players[result.state.currentPlayerIndex].id);
      }

      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "That action could not be applied.";
      if (mode === "online" && onlineRoom && message.toLowerCase().includes("stale")) {
        try {
          setOnlineRoom(await getOnlineRoom(serverUrl, onlineRoom.id, onlinePlayerId, revealAll));
          setError("Room refreshed after a stale action. Try the move again.");
          return;
        } catch {
          setError(message);
          return;
        }
      }
      setError(message);
    }
  }

  function clearSavedGame() {
    window.localStorage.removeItem(LOCAL_SAVE_KEY);
    setError("Local save cleared. The current table stays open until you start a new game.");
  }

  function changeSoundEnabled(enabled: boolean) {
    setSoundEnabled(enabled);

    if (!enabled) {
      setSoundReady(false);
      return;
    }

    const ready = armFeedbackAudio();
    setSoundReady(ready);
    if (ready) {
      playFeedbackCue("turn", true);
    }
  }

  return (
    <main className="app-shell">
      <section className="top-bar">
        <div>
          <p className="eyebrow">Local Alpha Prototype</p>
          <h1>Shapes</h1>
        </div>
        <div className="setup-controls" aria-label="Game setup">
          <label>
            Mode
            <select value={mode} onChange={(event) => changeMode(event.target.value as AppMode)}>
              <option value="local">Local Table</option>
              <option value="online">Online Room</option>
            </select>
          </label>
          {mode === "local" ? (
            <>
              <label>
                Viewing
                <select value={viewer.id} onChange={(event) => setViewerPlayerId(event.target.value)}>
                  {state.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => resetGame(seed)}>
                New game
              </button>
              <button type="button" className="secondary-button" onClick={() => setShowSetup(true)}>
                Setup
              </button>
            </>
          ) : (
            <>
              <label>
                Name
                <input value={onlineName} onChange={(event) => setOnlineName(event.target.value)} />
              </label>
              {onlineRoom ? (
                <button type="button" className="secondary-button" onClick={() => void refreshRoom()}>
                  Refresh room
                </button>
              ) : null}
              <button type="button" className="secondary-button" onClick={() => setShowSetup(true)}>
                Setup
              </button>
            </>
          )}
        </div>
      </section>

      {showSetup ? (
        <SetupDrawer
          mode={mode}
          playerCount={playerCount}
          seed={seed}
          serverUrl={serverUrl}
          onlineName={onlineName}
          canChangePlayerCount={state.turn <= 1 || state.phase !== "playing"}
          onPlayerCountChange={setPlayerCount}
          onSeedChange={setSeed}
          onServerUrlChange={setServerUrl}
          onOnlineNameChange={setOnlineName}
          onRandomSeed={() => {
            const nextSeed = newSeed();
            setSeed(nextSeed);
            resetGame(nextSeed);
          }}
          onClearSave={clearSavedGame}
          onClose={() => setShowSetup(false)}
        />
      ) : null}

      {showRules ? <RulesDrawer onClose={() => setShowRules(false)} /> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      {mode === "online" && !onlineRoom ? (
        <OnlineRoomSetup
          serverUrl={serverUrl}
          onlineName={onlineName}
          roomId={onlineJoinRoomId}
          busy={onlineBusy}
          onServerUrlChange={setServerUrl}
          onOnlineNameChange={setOnlineName}
          onRoomIdChange={setOnlineJoinRoomId}
          onCreate={() => void createRoom()}
          onJoin={() => void joinRoom()}
        />
      ) : null}

      {mode === "online" && onlineRoom && !onlineRoom.gameView ? (
        <OnlineLobby
          room={onlineRoom}
          playerId={onlinePlayerId}
          serverUrl={serverUrl}
          busy={onlineBusy}
          onStart={() => void startRoom()}
        />
      ) : null}

      {hasActiveGame ? (
        <>
          <section className="status-strip" aria-label="Game status">
            <StatusItem label="Turn" value={state.turn.toString()} />
            <StatusItem label="Current" value={currentPlayer.name} />
            <StatusItem label="Seat" value={viewer.name} />
            <StatusItem label="Insight" value={`${state.insightTokens}/${state.maxInsightTokens}`} />
            <StatusItem
              label="Cracks"
              value={`${state.crackTokens}/${state.maxCrackTokens}`}
              danger={state.crackTokens > 0}
            />
            <StatusItem label="Deck" value={state.deck.length.toString()} />
            <StatusItem label="Table" value={mode === "online" && onlineRoom ? `v${onlineRoom.version}` : "Local"} />
          </section>

          <section className="table-options" aria-label="View options">
            <ScoreBarSummary state={state} />
            <div className="table-option-buttons">
              <button type="button" className="secondary-button compact-button" onClick={() => setShowRules(true)}>
                Rules
              </button>
              {mode === "online" && onlineRoom ? (
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => void refreshRoom()}
                  disabled={onlineBusy !== "idle"}
                >
                  {onlineBusy === "refreshing" ? "Refreshing..." : "Refresh"}
                </button>
              ) : null}
            </div>
            {state.finalTurnsRemaining !== null && state.phase === "playing" ? (
              <strong>{state.finalTurnsRemaining} final turns remaining</strong>
            ) : null}
          </section>

          <FloatingDebugControls
            revealAll={revealAll}
            followTurn={followTurn}
            soundEnabled={soundEnabled}
            soundReady={soundReady}
            onRevealAllChange={setRevealAll}
            onFollowTurnChange={setFollowTurn}
            onSoundEnabledChange={changeSoundEnabled}
          />
          {turnNotice ? <TurnBanner key={turnNotice.id} playerName={turnNotice.playerName} /> : null}

          <div className="game-layout">
            <PokerTable
              state={state}
              currentPlayer={currentPlayer}
              viewerPlayerId={viewer.id}
              revealAll={revealAll}
              canActForCurrentPlayer={canActForCurrentPlayer}
              tableFocus={tableFocus}
              selectedCard={selectedCard}
              cluePreview={cluePreview}
              clueHistory={clueHistory}
              feedback={tableFeedback}
              onTableFocusChange={setTableFocus}
              onSelectedCardChange={setSelectedCard}
              onAction={perform}
            />

            <aside className="command-rail" aria-label="Actions and game state">
              <ActionPanel
                state={state}
                currentPlayer={currentPlayer}
                legalActions={legalActions}
                viewerName={viewer.name}
                canActForCurrentPlayer={canActForCurrentPlayer}
                onCluePreviewChange={setCluePreview}
                onAction={perform}
              />
              <TableInfoPanel
                focus={tableFocus}
                state={state}
                viewerPlayerId={viewer.id}
                revealAll={revealAll}
                filters={discardFilters}
                filteredDiscards={filteredDiscards}
                onFiltersChange={setDiscardFilters}
              />
              <EventLogPanel events={activeEvents} />
            </aside>
          </div>
        </>
      ) : null}
    </main>
  );
}

function OnlineRoomSetup({
  serverUrl,
  onlineName,
  roomId,
  busy,
  onServerUrlChange,
  onOnlineNameChange,
  onRoomIdChange,
  onCreate,
  onJoin
}: {
  serverUrl: string;
  onlineName: string;
  roomId: string;
  busy: OnlineBusyState;
  onServerUrlChange: (serverUrl: string) => void;
  onOnlineNameChange: (name: string) => void;
  onRoomIdChange: (roomId: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const isBusy = busy !== "idle";

  return (
    <section className="online-panel">
      <div>
        <h2>Online Room</h2>
        <p className="muted">Create or join with a room id.</p>
      </div>
      <div className="online-actions server-actions">
        <label>
          Server
          <input value={serverUrl} onChange={(event) => onServerUrlChange(event.target.value)} />
        </label>
        <label>
          Name
          <input value={onlineName} onChange={(event) => onOnlineNameChange(event.target.value)} />
        </label>
      </div>
      <div className="online-actions">
        <button type="button" onClick={onCreate} disabled={isBusy}>
          {busy === "creating" ? "Creating..." : "Create room"}
        </button>
        <label>
          Room id
          <input value={roomId} onChange={(event) => onRoomIdChange(event.target.value)} />
        </label>
        <button type="button" className="secondary-button" onClick={onJoin} disabled={isBusy || roomId.trim().length === 0}>
          {busy === "joining" ? "Joining..." : "Join room"}
        </button>
      </div>
    </section>
  );
}

function OnlineLobby({
  room,
  playerId,
  serverUrl,
  busy,
  onStart
}: {
  room: RoomClientView;
  playerId: string;
  serverUrl: string;
  busy: OnlineBusyState;
  onStart: () => void;
}) {
  const isHost = room.hostPlayerId === playerId;
  const [copied, setCopied] = useState(false);
  const inviteLink = buildInviteLink(serverUrl, room.code);

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="online-panel">
      <div>
        <h2>Lobby {room.code}</h2>
        <p className="muted">Room id: {room.id}</p>
      </div>
      <div className="invite-link-row">
        <label>
          Invite link
          <input value={inviteLink} readOnly />
        </label>
        <button type="button" className="secondary-button" onClick={() => void copyInviteLink()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <ul className="lobby-list">
        {room.players.map((player) => (
          <li key={player.id}>
            <strong>{player.name}</strong>
            <span>{player.id === room.hostPlayerId ? "Host" : "Player"}</span>
          </li>
        ))}
      </ul>
      <button type="button" disabled={!isHost || room.players.length < 2 || busy !== "idle"} onClick={onStart}>
        {busy === "starting" ? "Starting..." : "Start game"}
      </button>
    </section>
  );
}

function SetupDrawer({
  mode,
  playerCount,
  seed,
  serverUrl,
  onlineName,
  canChangePlayerCount,
  onPlayerCountChange,
  onSeedChange,
  onServerUrlChange,
  onOnlineNameChange,
  onRandomSeed,
  onClearSave,
  onClose
}: {
  mode: AppMode;
  playerCount: number;
  seed: string;
  serverUrl: string;
  onlineName: string;
  canChangePlayerCount: boolean;
  onPlayerCountChange: (count: number) => void;
  onSeedChange: (seed: string) => void;
  onServerUrlChange: (serverUrl: string) => void;
  onOnlineNameChange: (name: string) => void;
  onRandomSeed: () => void;
  onClearSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="overlay-scrim" role="presentation" onMouseDown={onClose}>
      <section className="dialog-card setup-dialog" role="dialog" aria-modal="true" aria-label="Game setup" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <span className="panel-kicker">Setup</span>
            <h2>{mode === "local" ? "Local Table" : "Online Room"}</h2>
          </div>
          <button type="button" className="ghost-dark-button" onClick={onClose} aria-label="Close setup">
            Close
          </button>
        </div>

        {mode === "local" ? (
          <div className="setup-grid">
            <label>
              Players
              <select
                value={playerCount}
                onChange={(event) => onPlayerCountChange(Number(event.target.value))}
                disabled={!canChangePlayerCount}
              >
                {[2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seed
              <input value={seed} onChange={(event) => onSeedChange(event.target.value)} />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={onRandomSeed}>
                Random seed
              </button>
              <button type="button" className="secondary-button" onClick={onClearSave}>
                Clear save
              </button>
            </div>
          </div>
        ) : (
          <div className="setup-grid">
            <label>
              Server
              <input value={serverUrl} onChange={(event) => onServerUrlChange(event.target.value)} />
            </label>
            <label>
              Name
              <input value={onlineName} onChange={(event) => onOnlineNameChange(event.target.value)} />
            </label>
          </div>
        )}
      </section>
    </div>
  );
}

function RulesDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay-scrim" role="presentation" onMouseDown={onClose}>
      <section className="dialog-card rules-dialog" role="dialog" aria-modal="true" aria-label="Rules" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <span className="panel-kicker">Rules</span>
            <h2>How Shapes Plays</h2>
          </div>
          <button type="button" className="ghost-dark-button" onClick={onClose} aria-label="Close rules">
            Close
          </button>
        </div>
        <div className="quick-rules">
          <article>
            <strong>Goal</strong>
            <span>Build each shape from rank 1 to 5. Completed stairs and contracts set the score.</span>
          </article>
          <article>
            <strong>On Your Turn</strong>
            <span>Give one clue, play one selected card, or discard one selected card.</span>
          </article>
          <article>
            <strong>Clues</strong>
            <span>A clue names one shape, rank, or pattern and marks every matching card in that hand.</span>
          </article>
          <article>
            <strong>Play</strong>
            <span>A card only lands if it is the next rank needed for that shape. A miss adds a Crack.</span>
          </article>
          <article>
            <strong>Discard</strong>
            <span>Discarding recovers one Insight up to the table maximum.</span>
          </article>
          <article>
            <strong>End</strong>
            <span>The final round starts when the draw pile runs out, or the table ends early at three Cracks.</span>
          </article>
        </div>
      </section>
    </div>
  );
}

function EventLogPanel({ events }: { events: GameEvent[] }) {
  const visibleEvents = events.slice(0, 12);

  return (
    <section className="panel-section event-log-panel" aria-label="Table log">
      <div className="section-heading compact">
        <h2>Log</h2>
        <span className="section-note">{events.length} events</span>
      </div>
      {visibleEvents.length === 0 ? (
        <p className="muted compact-muted">No table events yet.</p>
      ) : (
        <ol className="event-timeline">
          {visibleEvents.map((event, index) => (
            <li className={`event-timeline-item event-${event.type}`} key={`${event.id}-${index}`}>
              <span className="event-turn">T{event.turn}</span>
              <span className="event-dot" aria-hidden="true" />
              <span className="event-message">{event.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function StatusItem({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={danger ? "status-item danger" : "status-item"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Blueprints({ state, feedback }: { state: GameState; feedback: TableFeedback | null }) {
  return (
    <section className={feedback?.kind === "played" ? "board-section blueprint-board pulse-played" : "board-section blueprint-board"}>
      <div className="section-heading">
        <h2>Blueprints</h2>
        <span className="section-note">1-5 stairs</span>
      </div>
      <div className="blueprint-lanes">
        {SHAPE_FAMILIES.map((shape) => (
          <div className="blueprint-lane" key={shape}>
            <div className="blueprint-lane-label">
              <ShapeIcon shape={shape} />
              <span>{formatShape(shape)}</span>
            </div>
            <div className="blueprint-stair">
              {RANKS.map((rank) => {
                const card = state.blueprints[shape].find((played) => played.rank === rank);
                const isRecent = Boolean(card && feedback?.kind === "played" && feedback.card?.id === card.id);
                return (
                  <div
                    className={
                      card
                        ? `blueprint-step step-${rank} filled${isRecent ? " recent-card" : ""}`
                        : `blueprint-step step-${rank}`
                    }
                    key={rank}
                  >
                    {card ? <BlueprintCard card={card} /> : <span>{rank}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BlueprintCard({ card }: { card: Card }) {
  return (
    <div className={`blueprint-card suit-${card.shape} pattern-${card.pattern}`}>
      <span>{card.rank}</span>
      <ShapeIcon shape={card.shape} pattern={card.pattern} />
    </div>
  );
}

function ObjectivesPanel({ state }: { state: GameState }) {
  const score = scoreGame(state);

  return (
    <section className="panel-section objectives-panel">
      <div className="section-heading">
        <h2>Contracts</h2>
        <span className="section-note">+{score.objectiveScore}</span>
      </div>
      <div className="objective-list">
        {score.objectives.map(({ objective, points, achieved, detail }) => (
          <article className={achieved ? "objective achieved" : "objective"} key={objective.id}>
            <div>
              <h3>{objective.name}</h3>
              <p>{objective.description}</p>
              <small>{detail}</small>
            </div>
            <strong>+{points}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function DraftRow({
  state,
  currentPlayer,
  canActForCurrentPlayer,
  selectedCard,
  onSelectedCardChange
}: {
  state: GameState;
  currentPlayer: Player;
  canActForCurrentPlayer: boolean;
  selectedCard: CardSelection;
  onSelectedCardChange: (selection: CardSelection) => void;
}) {
  if (state.draftRow.length === 0) {
    return null;
  }

  return (
    <section className="board-section draft-section">
      <div className="section-heading">
        <h2>Shared Draft</h2>
        <span className="section-note">{state.draftRow.length} cards</span>
      </div>
      <div className="draft-row">
        {state.draftRow.map((card, index) => (
          <div
            className={
              selectedCard?.source === "draft" && selectedCard.cardIndex === index
                ? "hand-card-wrap selected"
                : "hand-card-wrap"
            }
            key={`${card.id}-${index}`}
          >
            {state.phase === "playing" && canActForCurrentPlayer ? (
              <button
                type="button"
                className="card-select-button"
                aria-label={`Select draft card ${index + 1}: ${formatShape(card.shape)} ${card.rank} ${formatPattern(card.pattern)}`}
                onClick={() =>
                  onSelectedCardChange(
                    nextSelection(selectedCard, { playerId: currentPlayer.id, cardIndex: index, source: "draft" })
                  )
                }
              >
                <CardFace card={card} />
              </button>
            ) : (
              <CardFace card={card} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function PokerTable({
  state,
  currentPlayer,
  viewerPlayerId,
  revealAll,
  canActForCurrentPlayer,
  tableFocus,
  selectedCard,
  cluePreview,
  clueHistory,
  feedback,
  onTableFocusChange,
  onSelectedCardChange,
  onAction
}: {
  state: GameState;
  currentPlayer: Player;
  viewerPlayerId: string;
  revealAll: boolean;
  canActForCurrentPlayer: boolean;
  tableFocus: TableFocus;
  selectedCard: CardSelection;
  cluePreview: CluePreview;
  clueHistory: ClueEntry[];
  feedback: TableFeedback | null;
  onTableFocusChange: (focus: TableFocus) => void;
  onSelectedCardChange: (selection: CardSelection) => void;
  onAction: (action: GameAction) => void;
}) {
  const viewer = state.players.find((player) => player.id === viewerPlayerId) ?? currentPlayer;
  const otherPlayers = state.players.filter((player) => player.id !== viewer.id);
  const feedbackClass = feedback ? ` feedback-${feedback.kind}` : "";

  return (
    <section className="table-stage" aria-label="Game table">
      <div className={`felt-table${feedbackClass}`}>
        <div className="table-rim" aria-hidden="true" />
        <div className="opponent-seats">
          {otherPlayers.map((player) => (
            <PlayerSeat
              key={player.id}
              player={player}
              isCurrent={player.id === currentPlayer.id}
              isViewer={false}
              revealAll={revealAll}
              canAct={canActForCurrentPlayer}
              cluePreview={cluePreview}
              selectedCard={selectedCard}
              onSelectedCardChange={onSelectedCardChange}
              gamePhase={state.phase}
              variant="opponent"
            />
          ))}
        </div>

        <div className="table-center">
          <TableTokenTray state={state} feedback={feedback} clues={clueHistory} />
          <div className="center-tableau">
            <Blueprints state={state} feedback={feedback} />
          </div>
          <TableObjects state={state} selected={tableFocus} feedback={feedback} onSelect={onTableFocusChange} />
          <DraftRow
            state={state}
            currentPlayer={currentPlayer}
            canActForCurrentPlayer={canActForCurrentPlayer}
            selectedCard={selectedCard}
            onSelectedCardChange={onSelectedCardChange}
          />
          <SelectedCardActionBar
            state={state}
            selection={selectedCard}
            viewerPlayerId={viewer.id}
            revealAll={revealAll}
            canActForCurrentPlayer={canActForCurrentPlayer}
            onClear={() => onSelectedCardChange(null)}
            onAction={onAction}
          />
        </div>

        <div className="viewer-seat">
          <PlayerSeat
            player={viewer}
            isCurrent={viewer.id === currentPlayer.id}
            isViewer
            revealAll={revealAll}
            canAct={canActForCurrentPlayer}
            cluePreview={cluePreview}
            selectedCard={selectedCard}
            onSelectedCardChange={onSelectedCardChange}
            gamePhase={state.phase}
            variant="viewer"
          />
        </div>
      </div>
    </section>
  );
}

function SelectedCardActionBar({
  state,
  selection,
  viewerPlayerId,
  revealAll,
  canActForCurrentPlayer,
  onClear,
  onAction
}: {
  state: GameState;
  selection: CardSelection;
  viewerPlayerId: string;
  revealAll: boolean;
  canActForCurrentPlayer: boolean;
  onClear: () => void;
  onAction: (action: GameAction) => void;
}) {
  if (!selection || state.phase !== "playing" || !canActForCurrentPlayer) {
    return null;
  }

  const handCard =
    selection.source === "hand"
      ? state.players.find((player) => player.id === selection.playerId)?.hand[selection.cardIndex]
      : undefined;
  const selected = selection.source === "draft" ? state.draftRow[selection.cardIndex] : handCard?.card;

  if (!selected) {
    return null;
  }

  const source = selection.source === "draft" ? { source: "draft" as const } : {};
  const hiddenSelection = selection.source === "hand" && selection.playerId === viewerPlayerId && !revealAll;
  const known = handCard ? getKnownCardInfo(handCard) : null;

  return (
    <div className="selected-action-bar" aria-label="Selected card actions">
      <div className="selected-card-summary">
        {hiddenSelection ? <MiniCardBack known={known ?? {}} /> : <MiniCard card={selected} />}
        <div>
          <span className="selected-kicker">Selected</span>
          <strong>
            {hiddenSelection ? `Hand card ${selection.cardIndex + 1}` : `${formatShape(selected.shape)} ${selected.rank}`}
          </strong>
          <span>{hiddenSelection && known ? knownCardLabel(known) : formatPattern(selected.pattern)}</span>
        </div>
      </div>
      <div className="selected-actions">
        <button
          type="button"
          title={hiddenSelection ? "Play the selected hidden card. A wrong card adds a Crack." : playHintForCard(state, selected)}
          onClick={() => onAction({ type: "PLAY_CARD", playerId: selection.playerId, cardIndex: selection.cardIndex, ...source })}
        >
          Play
        </button>
        <button
          type="button"
          className="secondary-button"
          title={state.insightTokens >= state.maxInsightTokens ? "Insight is already full. Discarding is still allowed." : "Discard to recover 1 Insight."}
          onClick={() =>
            onAction({ type: "DISCARD_CARD", playerId: selection.playerId, cardIndex: selection.cardIndex, ...source })
          }
        >
          Discard
        </button>
        <button type="button" className="ghost-button" onClick={onClear}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function TableTokenTray({
  state,
  feedback,
  clues
}: {
  state: GameState;
  feedback: TableFeedback | null;
  clues: ClueEntry[];
}) {
  const recentClues = clues.slice(0, 3);

  return (
    <div className="table-token-tray" aria-label="Table tokens and clue notes">
      <div className={feedback?.kind === "clue" ? "felt-token-cluster insight-cluster clue-flash" : "felt-token-cluster insight-cluster"}>
        <div className="felt-token-heading">
          <span>Insight</span>
          <strong>
            {state.insightTokens}/{state.maxInsightTokens}
          </strong>
        </div>
        <div className="insight-chip-row" aria-hidden="true">
          {Array.from({ length: state.maxInsightTokens }, (_, index) => (
            <span className={index < state.insightTokens ? "insight-chip active" : "insight-chip spent"} key={`insight-${index}`} />
          ))}
        </div>
      </div>

      <div className={`${state.crackTokens > 0 ? "felt-token-cluster crack-cluster danger" : "felt-token-cluster crack-cluster"}${feedback?.kind === "misplayed" ? " crack-flash" : ""}`}>
        <div className="felt-token-heading">
          <span>Cracks</span>
          <strong>
            {state.crackTokens}/{state.maxCrackTokens}
          </strong>
        </div>
        <div className="crack-shard-row" aria-hidden="true">
          {Array.from({ length: state.maxCrackTokens }, (_, index) => (
            <span className={index < state.crackTokens ? "crack-shard active" : "crack-shard"} key={`crack-${index}`} />
          ))}
        </div>
      </div>

      <div className="felt-token-cluster clue-note-cluster">
        <div className="felt-token-heading">
          <span>Clues</span>
          <strong>{clues.length}</strong>
        </div>
        <div className="clue-note-row">
          {recentClues.length === 0 ? (
            <span className="empty-clue-note">No notes</span>
          ) : (
            recentClues.map((entry) => (
              <span className={`clue-note clue-${entry.clue.kind}`} key={entry.id} title={`${entry.fromName} to ${entry.targetName}: ${clueLabel(entry.clue)}`}>
                <strong>{clueLabel(entry.clue)}</strong>
                <small>{entry.targetName}</small>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TableObjects({
  state,
  selected,
  feedback,
  onSelect
}: {
  state: GameState;
  selected: TableFocus;
  feedback: TableFeedback | null;
  onSelect: (focus: TableFocus) => void;
}) {
  const topDiscard = state.discardPile[state.discardPile.length - 1];
  const score = scoreGame(state);

  return (
    <div className="table-objects" aria-label="Table piles">
      <button
        type="button"
        className={`table-object${selected === "deck" ? " active" : ""}${feedback?.kind === "drawn" ? " pulse-draw" : ""}`}
        onClick={() => onSelect("deck")}
        aria-pressed={selected === "deck"}
      >
        <span className="pile-art deck-pile" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="pile-copy">
          <strong>Draw</strong>
          <small>{state.deck.length} cards</small>
        </span>
      </button>

      <button
        type="button"
        className={`table-object${selected === "discard" ? " active" : ""}${feedback?.kind === "discarded" ? " pulse-discard" : ""}`}
        onClick={() => onSelect("discard")}
        aria-pressed={selected === "discard"}
      >
        <span className="pile-art discard-pile" aria-hidden="true">
          {topDiscard ? <PileTopCard card={topDiscard} /> : <span className="empty-pile" />}
        </span>
        <span className="pile-copy">
          <strong>Discard</strong>
          <small>{state.discardPile.length} cards</small>
        </span>
      </button>

      <button
        type="button"
        className={selected === "objectives" ? "table-object active" : "table-object"}
        onClick={() => onSelect("objectives")}
        aria-pressed={selected === "objectives"}
      >
        <span className="pile-art contract-pile" aria-hidden="true">
          <span />
          <span />
        </span>
        <span className="pile-copy">
          <strong>Contracts</strong>
          <small>+{score.objectiveScore} points</small>
        </span>
      </button>
    </div>
  );
}

function PlayerSeat({
  player,
  isCurrent,
  isViewer,
  revealAll,
  canAct,
  cluePreview,
  selectedCard,
  onSelectedCardChange,
  gamePhase,
  variant
}: {
  player: Player;
  isCurrent: boolean;
  isViewer: boolean;
  revealAll: boolean;
  canAct: boolean;
  cluePreview: CluePreview;
  selectedCard: CardSelection;
  onSelectedCardChange: (selection: CardSelection) => void;
  gamePhase: GameState["phase"];
  variant: "opponent" | "viewer";
}) {
  const hidden = isViewer && !revealAll;
  const selectable = isCurrent && canAct && gamePhase === "playing";

  return (
    <article className={`player-seat ${variant} ${isCurrent ? "active" : ""} ${isViewer ? "self" : ""}`}>
      <div className="seat-header">
        <div className="seat-avatar" aria-hidden="true">
          {player.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h3>{player.name}</h3>
          <span>{isViewer ? "Your hand" : isCurrent ? "Acting" : "Visible hand"}</span>
        </div>
      </div>
      <div className="seat-hand">
        {player.hand.map((handCard, index) => {
          const isSelected =
            selectedCard?.source === "hand" && selectedCard.playerId === player.id && selectedCard.cardIndex === index;
          const previewMatch =
            cluePreview?.targetPlayerId === player.id && handCard.card[cluePreview.clue.kind] === cluePreview.clue.value;
          const className = `hand-card-wrap${isSelected ? " selected" : ""}${previewMatch ? " clue-preview-match" : ""}`;

          return (
            <div className={className} key={`${handCard.card.id}-${index}`}>
              {selectable ? (
                <button
                  type="button"
                  className="card-select-button"
                  aria-label={cardSelectionLabel(player, handCard, index, hidden)}
                  onClick={() =>
                    onSelectedCardChange(nextSelection(selectedCard, { playerId: player.id, cardIndex: index, source: "hand" }))
                  }
                >
                  <CardView handCard={handCard} hidden={hidden} />
                </button>
              ) : (
                <CardView handCard={handCard} hidden={hidden} />
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ActionPanel({
  state,
  currentPlayer,
  legalActions,
  viewerName,
  canActForCurrentPlayer,
  onCluePreviewChange,
  onAction
}: {
  state: GameState;
  currentPlayer: Player;
  legalActions: GameAction[];
  viewerName: string;
  canActForCurrentPlayer: boolean;
  onCluePreviewChange: (preview: CluePreview) => void;
  onAction: (action: GameAction) => void;
}) {
  const clueActions = legalActions.filter(
    (action): action is Extract<GameAction, { type: "GIVE_CLUE" }> => action.type === "GIVE_CLUE"
  );
  const clueTargets = state.players.filter((player) => player.id !== currentPlayer.id);
  const [selectedTargetId, setSelectedTargetId] = useState(clueTargets[0]?.id ?? "");
  const selectedTarget = clueTargets.find((player) => player.id === selectedTargetId) ?? clueTargets[0] ?? null;

  useEffect(() => {
    if (!selectedTarget && clueTargets[0]) {
      setSelectedTargetId(clueTargets[0].id);
      return;
    }

    if (selectedTarget && selectedTarget.id !== selectedTargetId) {
      setSelectedTargetId(selectedTarget.id);
    }
  }, [clueTargets, selectedTarget, selectedTargetId]);

  if (state.phase === "finished") {
    return (
      <section className="panel-section action-panel">
        <div className="action-header">
          <div>
            <span className="panel-kicker">Table</span>
            <h2>Game Over</h2>
          </div>
        </div>
        <EndGameSummary state={state} />
      </section>
    );
  }

  return (
    <section className={canActForCurrentPlayer ? "panel-section action-panel your-turn-panel" : "panel-section action-panel"}>
      <div className="action-header">
        <div>
          <span className="panel-kicker">Action Tray</span>
          <h2>{currentPlayer.name}'s Turn</h2>
        </div>
        <div className={state.insightTokens > 0 ? "insight-meter" : "insight-meter empty"}>
          <span>Insight</span>
          <strong>
            {state.insightTokens}/{state.maxInsightTokens}
          </strong>
        </div>
      </div>
      <div className="action-context">
        <span>Viewing {viewerName}</span>
        <span>Turn {state.turn}</span>
      </div>
      <TurnCoach
        state={state}
        currentPlayer={currentPlayer}
        canActForCurrentPlayer={canActForCurrentPlayer}
        legalActionCount={legalActions.length}
      />
      <div className="clue-workbench">
        <div className="clue-target-tabs" aria-label="Choose clue target">
          {clueTargets.map((target) => (
            <button
              type="button"
              className={selectedTarget?.id === target.id ? "clue-target-tab active" : "clue-target-tab"}
              key={target.id}
              onClick={() => setSelectedTargetId(target.id)}
              aria-pressed={selectedTarget?.id === target.id}
            >
              <span className="clue-avatar mini" aria-hidden="true">
                {target.name.slice(0, 1).toUpperCase()}
              </span>
              <span>{target.name}</span>
              <strong>{target.hand.length}</strong>
            </button>
          ))}
        </div>
        {selectedTarget ? (
          <article className="clue-target focused">
            <div className="clue-target-header">
              <div className="clue-avatar" aria-hidden="true">
                {selectedTarget.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h3>{selectedTarget.name}</h3>
                <span>{selectedTarget.hand.length} cards</span>
              </div>
            </div>
            <ClueButtons
              target={selectedTarget}
              actions={clueActions.filter((action) => action.targetPlayerId === selectedTarget.id)}
              disabled={state.insightTokens <= 0 || !canActForCurrentPlayer}
              disabledReason={
                !canActForCurrentPlayer
                  ? `Waiting for ${currentPlayer.name}.`
                  : "No Insight tokens left. Discard to recover one."
              }
              onPreviewChange={onCluePreviewChange}
              onAction={onAction}
            />
          </article>
        ) : null}
      </div>
    </section>
  );
}

function TurnCoach({
  state,
  currentPlayer,
  canActForCurrentPlayer,
  legalActionCount
}: {
  state: GameState;
  currentPlayer: Player;
  canActForCurrentPlayer: boolean;
  legalActionCount: number;
}) {
  if (!canActForCurrentPlayer) {
    return (
      <div className="turn-coach waiting-state">
        <strong>Waiting for {currentPlayer.name}</strong>
        <span>The table will update when the room sends the next state.</span>
      </div>
    );
  }

  if (legalActionCount === 0) {
    return (
      <div className="turn-coach warning-state">
        <strong>No legal actions</strong>
        <span>Refresh the table or start a new game if this state persists.</span>
      </div>
    );
  }

  if (state.insightTokens <= 0) {
    return (
      <div className="turn-coach warning-state">
        <strong>No Insights</strong>
        <span>Select a card and discard it to recover one Insight.</span>
      </div>
    );
  }

  return (
    <div className="turn-coach">
      <strong>Your turn</strong>
      <span>Give an Insight, or select a card to play/discard.</span>
    </div>
  );
}

function EndGameSummary({ state }: { state: GameState }) {
  const score = scoreGame(state);
  const reason = state.finishReason ? state.finishReason.replace("-", " ") : "finished";
  const achieved = score.objectives.filter((entry) => entry.achieved).length;

  return (
    <div className="final-summary">
      <div>
        <span>Final Score</span>
        <strong>{score.totalScore}</strong>
      </div>
      <div>
        <span>Result</span>
        <strong>{reason}</strong>
      </div>
      <div>
        <span>Contracts</span>
        <strong>
          {achieved}/{score.objectives.length}
        </strong>
      </div>
      <p>{score.rating}</p>
    </div>
  );
}

function ClueButtons({
  target,
  actions,
  disabled,
  disabledReason,
  onPreviewChange,
  onAction
}: {
  target: Player;
  actions: Extract<GameAction, { type: "GIVE_CLUE" }>[];
  disabled: boolean;
  disabledReason: string;
  onPreviewChange: (preview: CluePreview) => void;
  onAction: (action: GameAction) => void;
}) {
  const groups = [
    {
      kind: "shape",
      label: "Shape",
      values: SHAPE_FAMILIES.map((shape) => ({ kind: "shape" as const, value: shape }))
    },
    {
      kind: "rank",
      label: "Rank",
      values: RANKS.map((rank) => ({ kind: "rank" as const, value: rank }))
    },
    {
      kind: "pattern",
      label: "Pattern",
      values: PATTERN_ORDER.map((pattern) => ({ kind: "pattern" as const, value: pattern }))
    }
  ];

  return (
    <div className="clue-button-groups">
      {groups.map((group) => (
        <div className={`clue-button-group ${group.kind}`} key={`${target.id}-${group.label}`}>
          <div className="clue-group-title">
            <span>{group.label}</span>
          </div>
          <div className="clue-chip-row">
            {group.values.map((clue) => {
              const action = findClue(actions, clue);
              const count = countMatchingCards(target, clue);
              return (
                <button
                  type="button"
                  className={`clue-chip clue-${clue.kind} ${count > 0 ? "has-match" : ""}`}
                  key={`${group.label}-${clue.value}`}
                  disabled={disabled || !action}
                  title={disabled ? disabledReason : action ? `${count} matching card${count === 1 ? "" : "s"}` : "No matching card in that hand."}
                  onClick={() => action && onAction(action)}
                  onFocus={() => onPreviewChange({ targetPlayerId: target.id, clue })}
                  onBlur={() => onPreviewChange(null)}
                  onMouseEnter={() => onPreviewChange({ targetPlayerId: target.id, clue })}
                  onMouseLeave={() => onPreviewChange(null)}
                  aria-label={`Clue ${target.name}: ${clueLabel(clue)}${count > 0 ? `, ${count} cards` : ""}`}
                >
                  <ClueChipIcon clue={clue} />
                  <span>{clueLabel(clue)}</span>
                  {count > 0 ? <strong>{count}</strong> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ClueChipIcon({ clue }: { clue: ClueValue }) {
  if (clue.kind === "shape") {
    return <ShapeIcon shape={clue.value} />;
  }

  if (clue.kind === "rank") {
    return null;
  }

  return <PatternSwatch pattern={clue.value} />;
}

function findClue<T extends ClueValue>(
  actions: Extract<GameAction, { type: "GIVE_CLUE" }>[],
  clue: T
): Extract<GameAction, { type: "GIVE_CLUE" }> | undefined {
  return actions.find((action) => action.clue.kind === clue.kind && action.clue.value === clue.value);
}

function countMatchingCards(target: Player, clue: ClueValue): number {
  return target.hand.filter((handCard) => handCard.card[clue.kind] === clue.value).length;
}

function clueLabel(clue: ClueValue): string {
  if (clue.kind === "rank") {
    return clue.value.toString();
  }
  return formatShape(String(clue.value));
}

function ScoreBarSummary({ state }: { state: GameState }) {
  const score = scoreGame(state);

  return (
    <div className="score-bar-summary" aria-label="Score summary">
      <span>Score</span>
      <strong>{score.totalScore}</strong>
      <em>{score.rating}</em>
      <small>{score.baseScore} blueprints</small>
      <small>{score.objectiveScore} contracts</small>
    </div>
  );
}

function TurnBanner({ playerName }: { playerName: string }) {
  return (
    <div className="turn-banner" role="status" aria-live="polite">
      <span>Your turn</span>
      <strong>{playerName}</strong>
    </div>
  );
}

function FloatingDebugControls({
  revealAll,
  followTurn,
  soundEnabled,
  soundReady,
  onRevealAllChange,
  onFollowTurnChange,
  onSoundEnabledChange
}: {
  revealAll: boolean;
  followTurn: boolean;
  soundEnabled: boolean;
  soundReady: boolean;
  onRevealAllChange: (enabled: boolean) => void;
  onFollowTurnChange: (enabled: boolean) => void;
  onSoundEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <div className="floating-debug-controls" aria-label="View and feedback controls">
      <button
        type="button"
        className={revealAll ? "debug-toggle active" : "debug-toggle"}
        aria-pressed={revealAll}
        onClick={() => onRevealAllChange(!revealAll)}
      >
        <span>Peek</span>
        <strong>{revealAll ? "On" : "Off"}</strong>
      </button>
      <button
        type="button"
        className={followTurn ? "debug-toggle active" : "debug-toggle"}
        aria-pressed={followTurn}
        onClick={() => onFollowTurnChange(!followTurn)}
      >
        <span>Follow</span>
        <strong>{followTurn ? "On" : "Off"}</strong>
      </button>
      <button
        type="button"
        className={soundEnabled ? "debug-toggle active" : "debug-toggle"}
        aria-pressed={soundEnabled}
        onClick={() => onSoundEnabledChange(!soundEnabled)}
        title={soundEnabled && !soundReady ? "Sound is on. Click or press a key once if the browser has not enabled audio yet." : "Toggle table sounds."}
      >
        <span>Sound</span>
        <strong>{soundEnabled ? (soundReady ? "Ready" : "On") : "Off"}</strong>
      </button>
    </div>
  );
}

function TableInfoPanel({
  focus,
  state,
  viewerPlayerId,
  revealAll,
  filters,
  filteredDiscards,
  onFiltersChange
}: {
  focus: TableFocus;
  state: GameState;
  viewerPlayerId: string;
  revealAll: boolean;
  filters: DiscardFilters;
  filteredDiscards: Card[];
  onFiltersChange: (filters: DiscardFilters) => void;
}) {
  if (focus === "deck") {
    const publicCards = getPublicNonDrawCards(state);
    const visibleHandCards = getVisibleHandCardsForViewer(state, viewerPlayerId, revealAll);
    const unseenCards = getUnseenPoolCards(state, visibleHandCards);
    const playedCount = SHAPE_FAMILIES.reduce((total, shape) => total + state.blueprints[shape].length, 0);
    const exhausted = state.deck.length === 0;
    const seenCount = publicCards.length + visibleHandCards.length;

    return (
      <section className="panel-section table-info-panel deck-panel">
        <div className="section-heading compact">
          <h2>Draw Pile</h2>
          <span className="section-note">{state.deck.length} left</span>
        </div>
        <div className="deck-info-card">
          <div className="large-deck-stack" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="deck-info-copy">
            <strong>{state.deck.length} cards remain</strong>
            <p className="muted">
              {state.finalTurnsRemaining === null && !exhausted
                ? "Final round starts when this pile runs out."
                : `${state.finalTurnsRemaining ?? 0} final turns remain.`}
            </p>
            <div className="pile-meta-row" aria-label="Draw pile summary">
              <span>
                <strong>{playedCount}</strong> played
              </span>
              <span>
                <strong>{seenCount}</strong> seen
              </span>
              <span>
                <strong>{exhausted ? "Empty" : "Live"}</strong>
              </span>
            </div>
          </div>
        </div>
        <HiddenDrawPile count={state.deck.length} />
        <PileComposition
          title="Unseen pool"
          cards={unseenCards}
          emptyLabel="No unseen cards remain."
        />
        <p className="muted compact-muted deck-privacy-note">
          Excludes public cards and teammate cards you can see. Your hidden hand stays mixed with the draw pile.
        </p>
      </section>
    );
  }

  if (focus === "objectives") {
    return <ObjectivesPanel state={state} />;
  }

  return (
    <section className="panel-section table-info-panel discard-panel">
      <div className="section-heading compact">
        <h2>Discard</h2>
        <span className="section-note">
          {filteredDiscards.length}/{state.discardPile.length}
        </span>
      </div>
      <PileComposition title="In discard" cards={state.discardPile} emptyLabel="No discarded cards yet." />
      <div className="filter-grid">
        <label>
          Shape
          <select
            value={filters.shape}
            onChange={(event) => onFiltersChange({ ...filters, shape: event.target.value as DiscardFilters["shape"] })}
          >
            <option value="all">All</option>
            {SHAPE_FAMILIES.map((shape) => (
              <option key={shape} value={shape}>
                {formatShape(shape)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rank
          <select
            value={filters.rank}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                rank: event.target.value === "all" ? "all" : (Number(event.target.value) as Rank)
              })
            }
          >
            <option value="all">All</option>
            {RANKS.map((rank) => (
              <option key={rank} value={rank}>
                {rank}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pattern
          <select
            value={filters.pattern}
            onChange={(event) =>
              onFiltersChange({ ...filters, pattern: event.target.value as DiscardFilters["pattern"] })
            }
          >
            <option value="all">All</option>
            {PATTERN_ORDER.map((pattern) => (
              <option key={pattern} value={pattern}>
                {formatPattern(pattern)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filteredDiscards.length === 0 ? (
        <p className="muted">No matching discards.</p>
      ) : (
        <div className="discard-grid">
          {filteredDiscards.map((card, index) => (
            <MiniCard key={`${card.id}-${index}`} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}

function HiddenDrawPile({ count }: { count: number }) {
  return (
    <div className="hidden-draw-pile" aria-label={`${count} hidden cards in draw pile`}>
      <div className="pile-composition-heading">
        <strong>Draw cards</strong>
        <span>{count} hidden</span>
      </div>
      {count === 0 ? (
        <p className="muted compact-muted">Draw pile is empty.</p>
      ) : (
        <div className="draw-back-grid" aria-hidden="true">
          {Array.from({ length: count }, (_, index) => (
            <span className="draw-back-card" key={`draw-back-${index}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function getPublicNonDrawCards(state: GameState): Card[] {
  return [
    ...state.discardPile,
    ...state.draftRow,
    ...SHAPE_FAMILIES.flatMap((shape) => state.blueprints[shape])
  ];
}

function getVisibleHandCardsForViewer(state: GameState, viewerPlayerId: string, revealAll: boolean): Card[] {
  return state.players.flatMap((player) => {
    if (!revealAll && player.id === viewerPlayerId) {
      return [];
    }

    return player.hand.map((handCard) => handCard.card);
  });
}

function getUnseenPoolCards(state: GameState, visibleHandCards: Card[]): Card[] {
  const seenCardIds = new Set([
    ...getPublicNonDrawCards(state).map((card) => card.id),
    ...visibleHandCards.map((card) => card.id)
  ]);
  return createDeck().filter((card) => !seenCardIds.has(card.id));
}

function PileComposition({ title, cards, emptyLabel }: { title: string; cards: Card[]; emptyLabel: string }) {
  return (
    <div className="pile-composition">
      <div className="pile-composition-heading">
        <strong>{title}</strong>
        <span>{cards.length} cards</span>
      </div>
      {cards.length === 0 ? (
        <p className="muted compact-muted">{emptyLabel}</p>
      ) : (
        <div className="composition-table" aria-label={`${title} composition`}>
          <div className="composition-header" aria-hidden="true">
            <span />
            {RANKS.map((rank) => (
              <span key={rank}>{rank}</span>
            ))}
          </div>
          {SHAPE_FAMILIES.map((shape) => (
            <div className="composition-row" key={shape}>
              <div className="composition-label">
                <ShapeIcon shape={shape} />
                <span>{formatShape(shape)}</span>
              </div>
              {RANKS.map((rank) => {
                const count = cards.filter((card) => card.shape === shape && card.rank === rank).length;
                return (
                  <span
                    className={count > 0 ? `composition-cell suit-${shape}` : "composition-cell empty"}
                    key={`${shape}-${rank}`}
                    title={`${count} ${formatShape(shape)} rank ${rank} card${count === 1 ? "" : "s"}`}
                  >
                    {count > 0 ? count : ""}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardView({ handCard, hidden }: { handCard: HandCard; hidden: boolean }) {
  const known = getKnownCardInfo(handCard);

  if (hidden) {
    return (
      <div className="card hidden-card">
        <div className="card-back-pattern" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <KnowledgeMarks known={known} />
      </div>
    );
  }

  return <CardFace card={handCard.card} handCard={handCard} />;
}

function CardFace({ card, handCard }: { card: Card; handCard?: HandCard }) {
  const known = handCard ? getKnownCardInfo(handCard) : null;

  return (
    <div className={`card card-face pattern-${card.pattern} suit-${card.shape}`}>
      <CardCorner card={card} />
      <div className="card-center">
        <ShapeIcon shape={card.shape} pattern={card.pattern} />
        <strong>{card.rank}</strong>
      </div>
      <div className="card-meta">
        <span>{formatShape(card.shape)}</span>
        <span>{formatPattern(card.pattern)}</span>
      </div>
      <CardCorner card={card} flipped />
      {known ? <KnowledgeMarks known={known} compact /> : null}
    </div>
  );
}

function CardCorner({ card, flipped = false }: { card: Card; flipped?: boolean }) {
  return (
    <div className={flipped ? "card-corner bottom" : "card-corner"}>
      <span>{card.rank}</span>
      <ShapeIcon shape={card.shape} pattern={card.pattern} />
    </div>
  );
}

function MiniCard({ card }: { card: Card }) {
  return (
    <div
      className={`mini-card suit-${card.shape} pattern-${card.pattern}`}
      title={`${formatShape(card.shape)} ${card.rank} ${formatPattern(card.pattern)}`}
    >
      <ShapeIcon shape={card.shape} pattern={card.pattern} />
      <span className="mini-rank">{card.rank}</span>
    </div>
  );
}

function PileTopCard({ card }: { card: Card }) {
  return (
    <div
      className={`pile-top-card suit-${card.shape} pattern-${card.pattern}`}
      title={`${formatShape(card.shape)} ${card.rank} ${formatPattern(card.pattern)}`}
    >
      <ShapeIcon shape={card.shape} pattern={card.pattern} />
      <span className="pile-top-rank">{card.rank}</span>
    </div>
  );
}

function MiniCardBack({ known }: { known: { shape?: ShapeFamily; rank?: Rank; pattern?: Pattern } }) {
  return (
    <div className="mini-card mini-card-back" title={knownCardLabel(known)}>
      <div className="mini-back-pattern" aria-hidden="true">
        <span />
        <span />
      </div>
      <KnowledgeMarks known={known} compact />
    </div>
  );
}

function ShapeIcon({ shape, pattern = "solid" }: { shape: ShapeFamily; pattern?: Pattern }) {
  const id = useSvgId(`shape-${shape}-${pattern}`);
  const path = shapePath(shape);
  const palette = SHAPE_PALETTES[shape];
  const fill = patternFill(pattern, id);

  return (
    <svg
      className={`shape-icon ${shape} pattern-${pattern}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <PatternDefs id={id} palette={palette} shapePathValue={path} />
      <g filter={`url(#${id}-shadow)`}>
        {pattern === "hollow" ? (
          <>
            <path d={path} fill="rgba(255,255,255,0.82)" stroke={`url(#${id}-edge)`} strokeLinejoin="round" strokeWidth="8" />
            <path d={path} fill="none" stroke="#ffffff" strokeLinejoin="round" strokeWidth="2" opacity="0.72" />
            <path d={path} fill="none" stroke={palette.dark} strokeLinejoin="round" strokeWidth="1.4" opacity="0.25" />
          </>
        ) : (
          <>
            <path d={path} fill={fill} stroke={palette.dark} strokeLinejoin="round" strokeWidth="1.6" />
            {pattern === "radiant" ? <RadiantFacets id={id} palette={palette} /> : null}
          </>
        )}
      </g>
      <path d="M18 13C26 7 40 7 49 16" fill="none" stroke="#ffffff" strokeLinecap="round" strokeWidth="4" opacity="0.42" />
      <path d="M17 51C26 57 42 57 49 48" fill="none" stroke={palette.dark} strokeLinecap="round" strokeWidth="3" opacity="0.16" />
    </svg>
  );
}

function PatternSwatch({ pattern }: { pattern: Pattern }) {
  const id = useSvgId(`pattern-${pattern}`);

  return (
    <svg className={`pattern-swatch pattern-${pattern}`} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      <PatternDefs id={id} palette={PATTERN_PALETTE} shapePathValue="M6 4H34Q36 4 36 6V22Q36 24 34 24H6Q4 24 4 22V6Q4 4 6 4Z" />
      <rect x="4" y="4" width="32" height="20" rx="6" fill={pattern === "hollow" ? "rgba(255,255,255,0.9)" : patternFill(pattern, id)} stroke={pattern === "hollow" ? `url(#${id}-edge)` : PATTERN_PALETTE.dark} strokeWidth={pattern === "hollow" ? "3" : "1.4"} />
      {pattern === "radiant" ? (
        <g clipPath={`url(#${id}-clip)`} opacity="0.55">
          <path d="M4 24L19 4L22 24Z" fill="#ffffff" opacity="0.34" />
          <path d="M17 4L36 4L26 24Z" fill={PATTERN_PALETTE.light} opacity="0.5" />
        </g>
      ) : null}
      <path d="M9 8C15 5 27 5 32 9" fill="none" stroke="#ffffff" strokeLinecap="round" strokeWidth="2" opacity="0.45" />
    </svg>
  );
}

function PatternDefs({
  id,
  palette,
  shapePathValue
}: {
  id: string;
  palette: VisualPalette;
  shapePathValue: string;
}) {
  return (
    <defs>
      <linearGradient id={`${id}-solid`} x1="12" x2="52" y1="8" y2="58" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={palette.light} />
        <stop offset="0.44" stopColor={palette.main} />
        <stop offset="1" stopColor={palette.dark} />
      </linearGradient>
      <linearGradient id={`${id}-edge`} x1="8" x2="56" y1="8" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={palette.light} />
        <stop offset="0.5" stopColor={palette.main} />
        <stop offset="1" stopColor={palette.dark} />
      </linearGradient>
      <radialGradient id={`${id}-radiant`} cx="30%" cy="22%" r="76%">
        <stop offset="0" stopColor="#fff4a8" />
        <stop offset="0.24" stopColor={palette.light} />
        <stop offset="0.56" stopColor={palette.main} />
        <stop offset="1" stopColor={palette.dark} />
      </radialGradient>
      <pattern id={`${id}-striped`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(34)">
        <rect width="14" height="14" fill={palette.soft} />
        <rect width="5.5" height="14" fill={palette.main} />
        <rect x="7.3" width="2.2" height="14" fill="#ffffff" opacity="0.62" />
        <rect x="11.5" width="1.2" height="14" fill={palette.dark} opacity="0.28" />
      </pattern>
      <pattern id={`${id}-dotted`} width="13" height="13" patternUnits="userSpaceOnUse">
        <rect width="13" height="13" fill={palette.soft} />
        <circle cx="3.5" cy="4" r="2.5" fill={palette.main} />
        <circle cx="9.5" cy="9" r="1.8" fill={palette.dark} opacity="0.42" />
        <circle cx="2.8" cy="3.2" r="0.8" fill="#ffffff" opacity="0.85" />
        <circle cx="8.8" cy="8.2" r="0.55" fill="#ffffff" opacity="0.65" />
      </pattern>
      <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor={palette.dark} floodOpacity="0.26" />
      </filter>
      <clipPath id={`${id}-clip`}>
        <path d={shapePathValue} />
      </clipPath>
    </defs>
  );
}

function RadiantFacets({ id, palette }: { id: string; palette: VisualPalette }) {
  return (
    <g clipPath={`url(#${id}-clip)`}>
      <path d="M32 4L41 35L18 13Z" fill="#ffffff" opacity="0.24" />
      <path d="M60 32L37 40L48 12Z" fill={palette.glow} opacity="0.34" />
      <path d="M32 60L23 32L48 51Z" fill={palette.light} opacity="0.28" />
      <path d="M5 32L28 24L17 52Z" fill={palette.dark} opacity="0.18" />
    </g>
  );
}

function patternFill(pattern: Pattern, id: string): string {
  if (pattern === "striped") {
    return `url(#${id}-striped)`;
  }

  if (pattern === "dotted") {
    return `url(#${id}-dotted)`;
  }

  if (pattern === "radiant") {
    return `url(#${id}-radiant)`;
  }

  return `url(#${id}-solid)`;
}

function shapePath(shape: ShapeFamily): string {
  switch (shape) {
    case "circle":
      return "M32 5C46.9 5 59 17.1 59 32S46.9 59 32 59 5 46.9 5 32 17.1 5 32 5Z";
    case "triangle":
      return "M32 5L59 57H5L32 5Z";
    case "square":
      return "M12 8H52C54.2 8 56 9.8 56 12V52C56 54.2 54.2 56 52 56H12C9.8 56 8 54.2 8 52V12C8 9.8 9.8 8 12 8Z";
    case "star":
      return "M32 4L39.4 24.1L60.7 24.7L43.8 37.6L49.8 58L32 46.2L14.2 58L20.2 37.6L3.3 24.7L24.6 24.1L32 4Z";
    case "hexagon":
      return "M20 6H44L60 32L44 58H20L4 32L20 6Z";
  }
}

function useSvgId(prefix: string): string {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return `${prefix}-${id}`;
}

function getKnownCardInfo(handCard: HandCard): { shape?: ShapeFamily; rank?: Rank; pattern?: Pattern } {
  return {
    shape: handCard.clues.find((clue) => clue.kind === "shape")?.value as ShapeFamily | undefined,
    rank: handCard.clues.find((clue) => clue.kind === "rank")?.value as Rank | undefined,
    pattern: handCard.clues.find((clue) => clue.kind === "pattern")?.value as Pattern | undefined
  };
}

function knownCardLabel(known: { shape?: ShapeFamily; rank?: Rank; pattern?: Pattern }): string {
  const parts = [
    known.rank ? `rank ${known.rank}` : null,
    known.shape ? formatShape(known.shape) : null,
    known.pattern ? formatPattern(known.pattern) : null
  ].filter(Boolean);

  return parts.length > 0 ? `Known: ${parts.join(", ")}` : "No known info";
}

function cardSelectionLabel(player: Player, handCard: HandCard, index: number, hidden: boolean): string {
  if (hidden) {
    return `Select ${player.name} hand card ${index + 1}. ${knownCardLabel(getKnownCardInfo(handCard))}.`;
  }

  return `Select ${player.name} hand card ${index + 1}: ${formatShape(handCard.card.shape)} ${handCard.card.rank} ${formatPattern(handCard.card.pattern)}.`;
}

function playHintForCard(state: GameState, card: Card): string {
  const nextRank = (state.blueprints[card.shape].length + 1) as Rank;
  return card.rank === nextRank
    ? `Playable: ${formatShape(card.shape)} needs rank ${nextRank}.`
    : `Risk: ${formatShape(card.shape)} needs rank ${nextRank}. A miss adds a Crack.`;
}

function nextSelection(current: CardSelection, next: NonNullable<CardSelection>): CardSelection {
  if (
    current &&
    current.playerId === next.playerId &&
    current.cardIndex === next.cardIndex &&
    current.source === next.source
  ) {
    return null;
  }

  return next;
}

function KnowledgeMarks({
  known,
  compact = false
}: {
  known: { shape?: ShapeFamily; rank?: Rank; pattern?: Pattern };
  compact?: boolean;
}) {
  if (!known.rank && !known.shape && !known.pattern) {
    return null;
  }

  return (
    <div className={compact ? "knowledge-marks compact" : "knowledge-marks"} aria-label="Known card information">
      {known.rank ? <span className="knowledge-mark known rank-mark">{known.rank}</span> : null}
      {known.shape ? (
        <span className="knowledge-mark known shape-mark">
          <ShapeIcon shape={known.shape} pattern={known.pattern} />
        </span>
      ) : null}
      {known.pattern ? (
        <span className="knowledge-mark known pattern-mark">
          <PatternSwatch pattern={known.pattern} />
        </span>
      ) : null}
    </div>
  );
}

function filterDiscards(cards: Card[], filters: DiscardFilters): Card[] {
  return cards.filter((card) => {
    if (filters.shape !== "all" && card.shape !== filters.shape) {
      return false;
    }
    if (filters.rank !== "all" && card.rank !== filters.rank) {
      return false;
    }
    if (filters.pattern !== "all" && card.pattern !== filters.pattern) {
      return false;
    }
    return true;
  });
}

function feedbackFromEvents(events: GameEvent[]): TableFeedback | null {
  const priority: GameEvent["type"][] = [
    "game_finished",
    "final_round_started",
    "clue_given",
    "card_misplayed",
    "card_played",
    "card_discarded",
    "card_drawn",
    "game_started"
  ];
  const event = priority.reduce<GameEvent | undefined>(
    (found, type) => found ?? events.find((candidate) => candidate.type === type),
    undefined
  );

  if (!event) {
    return null;
  }

  const kindByType: Partial<Record<GameEvent["type"], FeedbackKind>> = {
    game_started: "started",
    game_finished: "finished",
    final_round_started: "final",
    clue_given: "clue",
    card_misplayed: "misplayed",
    card_played: "played",
    card_discarded: "discarded",
    card_drawn: "drawn"
  };
  const kind = kindByType[event.type];

  return kind ? { id: Date.now(), kind, card: event.card } : null;
}

function collectClueHistory(state: GameState): ClueEntry[] {
  const clues = new Map<string, ClueEntry>();

  state.players.forEach((target) => {
    target.hand.forEach((handCard) => {
      handCard.clues.forEach((clue) => {
        const existing = clues.get(clue.id);
        if (existing) {
          existing.count += 1;
          return;
        }

        clues.set(clue.id, {
          id: clue.id,
          turn: clue.turn,
          fromName: state.players.find((player) => player.id === clue.fromPlayerId)?.name ?? "Unknown",
          targetName: target.name,
          clue: clueMarkToValue(clue),
          count: 1
        });
      });
    });
  });

  return [...clues.values()].sort((left, right) => right.turn - left.turn);
}

function clueMarkToValue(clue: ClueMark): ClueValue {
  if (clue.kind === "shape") {
    return { kind: "shape", value: clue.value as ShapeFamily };
  }

  if (clue.kind === "rank") {
    return { kind: "rank", value: clue.value as Rank };
  }

  return { kind: "pattern", value: clue.value as Pattern };
}
