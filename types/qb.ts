export type AnswerDirective =
  | 'accept'
  | 'prompt'
  | 'reject'
  | 'anti-prompt'
  | 'antiprompt'
  | 'skip';

export interface AnswerResult {
  directive: AnswerDirective | string;
  directedPrompt?: string;
}

export interface Tossup {
  id: string;
  question: string;
  questionHtml: string;
  answer: string;
  answerHtml: string;
  category?: string;
  subcategory?: string;
  difficulty?: string | number;
  setName?: string;
  setYear?: number;
  packetName?: string;
  packetNumber?: number;
  questionNumber?: number;
  updatedAt?: string;
}

export interface SessionHistoryEntry {
  id: string;
  tossup: Tossup;
  userAnswer: string;
  result: AnswerResult;
  timestamp: number;
}

export interface SessionStats {
  total: number;
  correct: number;
  prompts: number;
  incorrect: number;
  skipped: number;
  accuracy: number;
  streak: number;
}
