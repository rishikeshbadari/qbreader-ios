import type { AnswerResult, SessionHistoryEntry, Tossup } from '../types/qb';

export const MAX_HISTORY_ENTRIES = 200;
export const DEFAULT_PROMPT_TEXT = 'Be more specific';

export type QuestionFilters = {
  difficulties?: number[];
  categories?: string[];
};

export type PromptResolution =
  | { action: 'prompt'; directedPrompt?: string }
  | { action: 'record'; result: AnswerResult };

export function buildQuestionFilters(
  selectedDifficulties: number[],
  selectedCategories: string[],
): QuestionFilters {
  return {
    difficulties: selectedDifficulties.length > 0 ? selectedDifficulties : undefined,
    categories: selectedCategories.length > 0 ? selectedCategories : undefined,
  };
}

export function buildQuestionFiltersKey(filters: QuestionFilters): string {
  const difficulties = filters.difficulties ? [...filters.difficulties].sort((a, b) => a - b) : [];
  const categories = filters.categories ? [...filters.categories].sort() : [];
  return `${difficulties.join(',')}|${categories.join(',')}`;
}

export function getUniqueUnseenTossups(
  incoming: Tossup[],
  seenQuestionIds: Set<string>,
): Tossup[] {
  const uniqueQuestions: Tossup[] = [];
  for (const question of incoming) {
    if (seenQuestionIds.has(question.id)) {
      continue;
    }
    seenQuestionIds.add(question.id);
    uniqueQuestions.push(question);
  }
  return uniqueQuestions;
}

export function resolvePromptResult(
  result: AnswerResult,
  wasAlreadyPrompted: boolean,
): PromptResolution {
  if (result.directive === 'prompt' && !wasAlreadyPrompted) {
    return { action: 'prompt', directedPrompt: result.directedPrompt };
  }

  if (result.directive === 'prompt') {
    return { action: 'record', result: { ...result, directive: 'reject' } };
  }

  return { action: 'record', result };
}

export function resolvePromptDisplayText(_directedPrompt?: string | null): string {
  return DEFAULT_PROMPT_TEXT;
}

export function formatPromptHint(promptText?: string | null): string | null {
  const trimmedPrompt = promptText?.trim();
  if (!trimmedPrompt) {
    return null;
  }

  return /^prompt\s*:/i.test(trimmedPrompt) ? trimmedPrompt : `Prompt: ${trimmedPrompt}`;
}

export function prependHistoryEntry(
  history: SessionHistoryEntry[],
  entry: SessionHistoryEntry,
  maxEntries = MAX_HISTORY_ENTRIES,
): SessionHistoryEntry[] {
  const next = [entry, ...history];
  return next.length > maxEntries ? next.slice(0, maxEntries) : next;
}

export function createSessionHistoryEntry(
  tossup: Tossup,
  userAnswer: string,
  result: AnswerResult,
  timestamp: number,
  suffix?: string,
): SessionHistoryEntry {
  return {
    id: `${tossup.id}-${timestamp}${suffix ? `-${suffix}` : ''}`,
    tossup,
    userAnswer,
    result,
    timestamp,
  };
}
