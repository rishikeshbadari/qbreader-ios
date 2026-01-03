import type { AnswerResult, Tossup } from '@/types/qb';

/** A player in a multiplayer session */
export type Player = {
  id: string;
  name: string;
};

/** Game settings shared across all players */
export type GameSettings = {
  difficulties: number[];
  categories: string[];
  revealSpeed: number;
};

/** Session lifecycle states */
export type SessionStatus = 'idle' | 'lobby' | 'playing' | 'ended';

/** A player's buzz attempt on a question */
export type Buzz = {
  playerId: string;
  timestamp: number;
  answer: string;
  result?: AnswerResult;
};

/** Record of a single question in the game */
export type QuestionRecord = {
  question: Tossup;
  buzzes: Buzz[];
  winnerId?: string;
};

/** Complete game summary for review */
export type GameSummary = {
  sessionId: string;
  players: Player[];
  settings: GameSettings;
  questions: QuestionRecord[];
  endedAt?: number;
};

/** Events sent between players over the transport */
export type GameEvent =
  | { type: 'player:join'; player: Player }
  | { type: 'player:leave'; playerId: string }
  | { type: 'players:sync'; players: Player[] }
  | { type: 'game:start'; settings: GameSettings }
  | { type: 'game:pause' }
  | { type: 'game:end'; summary?: GameSummary }
  | { type: 'question:new'; tossup: Tossup }
  | { type: 'question:request' }
  | { type: 'buzz:lock'; playerId: string }
  | { type: 'buzz:unlock'; lockedOutPlayers: string[]; allLockedOut?: boolean; lastResult?: AnswerResult }
  | { type: 'buzz:submit'; buzz: Buzz }
  | { type: 'buzz:result'; buzz: Buzz };
