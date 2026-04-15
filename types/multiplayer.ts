import type { AnswerResult, Tossup } from '@/types/qb';

// ─────────────────────────────────────────────────────────────────────────────
// Scoring Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SCORING = {
  CORRECT: 10,
  POWER: 15,
  INCORRECT: -5,
  BUZZ_TIMEOUT_SECONDS: 8,
  WRONG_ANSWER_DISPLAY_MS: 1500,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Player Constants
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_PLAYERS = 10;

export const PLAYER_COLORS = [
  '#4338CA', // indigo
  '#DC2626', // red
  '#16A34A', // green
  '#EAB308', // yellow
  '#9333EA', // purple
  '#EA580C', // orange
  '#0891B2', // cyan
  '#DB2777', // pink
  '#65A30D', // lime
  '#6366F1', // violet
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────────────────────────────────────

/** A player in a multiplayer session */
export type Player = {
  id: string;
  name: string;
  status?: 'active' | 'left';
  ready?: boolean;
  connectionStatus?: 'connected' | 'reconnecting' | 'disconnected';
  color?: string;
  isHost?: boolean;
};

/** Game settings shared across all players */
export type GameSettings = {
  difficulties: number[];
  categories: string[];
  revealSpeed: number;
};

/** Session lifecycle states */
export type SessionStatus = 'idle' | 'lobby' | 'playing' | 'paused' | 'ended';

/** A player's buzz attempt on a question */
export type Buzz = {
  playerId: string;
  timestamp: number;
  answer: string;
  result?: AnswerResult;
  wordIndex?: number;
  isPower?: boolean;
  timedOut?: boolean;
};

/** Record of a single question in the game */
export type QuestionRecord = {
  question: Tossup;
  buzzes: Buzz[];
  winnerId?: string;
  powerMarkWordIndex?: number;
};

/** Complete game summary for review */
export type GameSummary = {
  sessionId: string;
  players: Player[];
  hostId: string;
  settings: GameSettings;
  questions: QuestionRecord[];
  endedAt?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// State Sync Payload (for late joiners)
// ─────────────────────────────────────────────────────────────────────────────

export type StateSyncPayload = {
  players: Player[];
  hostId: string;
  settings: GameSettings;
  status: SessionStatus;
  currentQuestion?: Tossup;
  powerMarkWordIndex?: number;
  scores: Record<string, number>;
  lockedOutPlayers: string[];
  questionRecords: QuestionRecord[];
  gameCode?: string;
  readyPlayers?: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

/** Events sent between players over the transport */
export type GameEvent =
  | { type: 'player:join'; player: Player }
  | { type: 'player:leave'; playerId: string }
  | { type: 'players:sync'; players: Player[]; hostId: string }
  | { type: 'player:ready'; playerId: string; ready: boolean }
  | { type: 'player:kick'; playerId: string }
  | { type: 'player:connection_status'; playerId: string; status: 'connected' | 'reconnecting' | 'disconnected' }
  | { type: 'host:transfer'; newHostId: string }
  | { type: 'game:start'; settings: GameSettings; hostId: string }
  | { type: 'game:countdown'; seconds: number }
  | { type: 'game:pause'; playerName?: string }
  | { type: 'game:resume' }
  | { type: 'game:end'; summary?: GameSummary }
  | { type: 'game:settings'; settings: GameSettings }
  | { type: 'question:new'; tossup: Tossup; powerMarkWordIndex?: number; revealStartTime?: number }
  | { type: 'question:preload'; tossup: Tossup; powerMarkWordIndex?: number }
  | { type: 'question:reveal'; revealStartTime: number }
  | { type: 'question:request' }
  | { type: 'buzz:lock'; playerId: string }
  | { type: 'buzz:unlock'; lockedOutPlayers: string[]; allLockedOut?: boolean; lastResult?: AnswerResult }
  | { type: 'buzz:submit'; buzz: Buzz }
  | { type: 'buzz:result'; buzz: Buzz; scores?: Record<string, number> }
  | { type: 'buzz:typing'; playerId: string; text: string }
  | { type: 'buzz:prompt'; playerId: string; directedPrompt?: string }
  | { type: 'buzz:timeout'; playerId: string }
  | { type: 'question:timeup' }
  | { type: 'coordinator:change'; newCoordinatorId: string }
  | { type: 'state:sync'; state: StateSyncPayload };
