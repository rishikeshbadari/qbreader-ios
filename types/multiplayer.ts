import type { AnswerResult, Tossup } from '@/types/qb';

// ─────────────────────────────────────────────────────────────────────────────
// Scoring Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SCORING = {
  CORRECT: 10,
  POWER: 15,
  INCORRECT: -5,
  BUZZ_TIMEOUT_SECONDS: 8,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────────────────────────────────────

/** A player in a multiplayer session */
export type Player = {
  id: string;
  name: string;
  status?: 'active' | 'left';
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
};

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

/** Events sent between players over the transport */
export type GameEvent =
  | { type: 'player:join'; player: Player }
  | { type: 'player:leave'; playerId: string }
  | { type: 'players:sync'; players: Player[]; hostId: string }
  | { type: 'game:start'; settings: GameSettings; hostId: string }
  | { type: 'game:pause' }
  | { type: 'game:resume' }
  | { type: 'game:end'; summary?: GameSummary }
  | { type: 'game:settings'; settings: GameSettings }
  | { type: 'question:new'; tossup: Tossup; powerMarkWordIndex?: number }
  | { type: 'question:request' }
  | { type: 'buzz:lock'; playerId: string }
  | { type: 'buzz:unlock'; lockedOutPlayers: string[]; allLockedOut?: boolean; lastResult?: AnswerResult }
  | { type: 'buzz:submit'; buzz: Buzz }
  | { type: 'buzz:result'; buzz: Buzz; scores?: Record<string, number> }
  | { type: 'buzz:timeout'; playerId: string }
  | { type: 'coordinator:change'; newCoordinatorId: string }
  | { type: 'state:sync'; state: StateSyncPayload };
