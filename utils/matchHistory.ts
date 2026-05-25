import type { GameSummary } from '../types/multiplayer';

export const MAX_HISTORY_MATCHES = 50;

export function parseMatchHistory(raw: string): GameSummary[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is GameSummary => (
    Boolean(item) &&
    typeof item === 'object' &&
    typeof (item as GameSummary).sessionId === 'string' &&
    Array.isArray((item as GameSummary).players) &&
    Array.isArray((item as GameSummary).questions)
  ));
}

export function prependMatchHistory(
  existing: GameSummary[],
  summary: GameSummary,
  maxMatches = MAX_HISTORY_MATCHES,
): GameSummary[] {
  return [summary, ...existing].slice(0, maxMatches);
}
