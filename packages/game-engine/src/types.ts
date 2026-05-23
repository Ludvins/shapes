export type ShapeFamily = "circle" | "triangle" | "square" | "star" | "hexagon";
export type Rank = 1 | 2 | 3 | 4 | 5;
export type Pattern = "solid" | "striped" | "dotted" | "hollow" | "radiant";

export interface Card {
  id: string;
  shape: ShapeFamily;
  rank: Rank;
  pattern: Pattern;
}

export type ClueKind = "shape" | "rank" | "pattern";

export type ClueValue =
  | { kind: "shape"; value: ShapeFamily }
  | { kind: "rank"; value: Rank }
  | { kind: "pattern"; value: Pattern };

export interface ClueMark {
  id: string;
  fromPlayerId: string;
  kind: ClueKind;
  value: ShapeFamily | Rank | Pattern;
  turn: number;
}

export interface HandCard {
  card: Card;
  clues: ClueMark[];
}

export interface Player {
  id: string;
  name: string;
  hand: HandCard[];
}

export type Blueprints = Record<ShapeFamily, Card[]>;

export interface ObjectiveCard {
  id: string;
  name: string;
  description: string;
}

export type GamePhase = "playing" | "finished";

export type FinishReason = "cracks" | "final-turns" | "perfect-score" | null;

export interface GameState {
  id: string;
  seed: string;
  players: Player[];
  draftRow: Card[];
  deck: Card[];
  discardPile: Card[];
  blueprints: Blueprints;
  objectives: ObjectiveCard[];
  insightTokens: number;
  crackTokens: number;
  maxInsightTokens: number;
  maxCrackTokens: number;
  currentPlayerIndex: number;
  turn: number;
  phase: GamePhase;
  finishReason: FinishReason;
  finalTurnsRemaining: number | null;
}

export interface CreateGameOptions {
  playerNames: string[];
  seed?: string;
  objectiveCount?: number;
  useTwoPlayerDraftRow?: boolean;
}

export type CardSource = "hand" | "draft";

export type GiveClueAction = {
  type: "GIVE_CLUE";
  playerId: string;
  targetPlayerId: string;
  clue: ClueValue;
};

export type PlayCardAction = {
  type: "PLAY_CARD";
  playerId: string;
  cardIndex: number;
  source?: CardSource;
};

export type DiscardCardAction = {
  type: "DISCARD_CARD";
  playerId: string;
  cardIndex: number;
  source?: CardSource;
};

export type GameAction = GiveClueAction | PlayCardAction | DiscardCardAction;

export type GameEventType =
  | "game_started"
  | "clue_given"
  | "card_played"
  | "card_misplayed"
  | "card_discarded"
  | "card_drawn"
  | "insight_recovered"
  | "final_round_started"
  | "game_finished";

export interface GameEvent {
  id: string;
  type: GameEventType;
  turn: number;
  message: string;
  playerId?: string;
  card?: Card;
}

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}

export interface KnownCardInfo {
  shape?: ShapeFamily;
  rank?: Rank;
  pattern?: Pattern;
}

export interface VisibleHandCard {
  id: string;
  actual: Card | null;
  known: KnownCardInfo;
  clues: ClueMark[];
}

export interface VisiblePlayer {
  id: string;
  name: string;
  hand: VisibleHandCard[];
}

export interface PlayerView {
  viewerPlayerId: string;
  revealAll: boolean;
  players: VisiblePlayer[];
  draftRow: Card[];
  deckCount: number;
  discardPile: Card[];
  blueprints: Blueprints;
  objectives: ObjectiveCard[];
  insightTokens: number;
  crackTokens: number;
  maxInsightTokens: number;
  maxCrackTokens: number;
  currentPlayerId: string;
  currentPlayerIndex: number;
  turn: number;
  phase: GamePhase;
  finishReason: FinishReason;
  finalTurnsRemaining: number | null;
}

export interface ObjectiveScore {
  objective: ObjectiveCard;
  points: number;
  achieved: boolean;
  detail: string;
}

export interface ScoreBreakdown {
  baseScore: number;
  objectiveScore: number;
  totalScore: number;
  rating: string;
  byShape: Record<ShapeFamily, number>;
  objectives: ObjectiveScore[];
}

export type RoomStatus = "lobby" | "active" | "finished";

export interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  joinedAt: string;
}

export interface RoomState {
  id: string;
  code: string;
  inviteToken: string;
  seed: string;
  status: RoomStatus;
  hostPlayerId: string;
  players: RoomPlayer[];
  gameState: GameState | null;
  events: GameEvent[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomClientView {
  id: string;
  code: string;
  inviteToken: string;
  seed: string;
  status: RoomStatus;
  hostPlayerId: string;
  players: RoomPlayer[];
  gameView: PlayerView | null;
  events: GameEvent[];
  version: number;
  createdAt: string;
  updatedAt: string;
  viewerRoomPlayerId: string | null;
}

export interface CreateRoomOptions {
  hostName: string;
  seed?: string;
  now?: string;
}

export interface JoinRoomOptions {
  playerName: string;
  now?: string;
}

export interface StartRoomGameOptions {
  hostPlayerId: string;
}

export interface SubmitRoomActionOptions {
  expectedVersion: number;
  action: GameAction;
}
