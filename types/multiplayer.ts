import type { AnswerResult, Tossup } from '@/types/qb';

export type MultiplayerPlayer = {
  id: string;
  name: string;
};

export type MultiplayerSettings = {
  difficulties: number[];
  categories: string[];
  revealSpeed: number;
};

export type MultiplayerSessionStatus = 'idle' | 'lobby' | 'in_progress' | 'ended';

export type MultiplayerBuzz = {
  playerId: string;
  timestamp: number;
  answer: string;
  result?: { directive: string; note?: string };
};

export type MultiplayerQuestionRecord = {
  question: Tossup;
  buzzes: MultiplayerBuzz[];
  winnerId?: string;
};

export type MultiplayerSessionSummary = {
  sessionId: string;
  players: MultiplayerPlayer[];
  settings: MultiplayerSettings;
  questions: MultiplayerQuestionRecord[];
  endedAt?: number;
};

export type MultiplayerEvent =
  | { type: 'player:joined'; payload: MultiplayerPlayer }
  | { type: 'players:sync'; payload: { players: MultiplayerPlayer[] } }
  | { type: 'player:left'; payload: { playerId: string } }
  | { type: 'session:pause'; payload: { reason?: string } }
  | { type: 'session:start'; payload: { settings: MultiplayerSettings; seed: string } }
  | { type: 'session:end'; payload: { reason?: string } }
  | { type: 'question:next'; payload: { requesterId: string } }
  | { type: 'question:new'; payload: { tossup: Tossup; seed: string } }
  | { type: 'buzz:lock'; payload: { playerId: string } }
  | { type: 'buzz'; payload: MultiplayerBuzz }
  | { type: 'buzz:result'; payload: MultiplayerBuzz }
  | { type: 'question:end'; payload: { winnerId?: string } };
