import { SCORING, type GameSummary } from '../types/multiplayer';
import type { AnswerResult } from '../types/qb';
import { normalizeDirective } from './directives';

export type PlayerScore = {
  id: string;
  name: string;
  status: 'active' | 'left';
  correct: number;
  incorrect: number;
  powers: number;
  points: number;
  accuracy: number;
};

export function computeMultiplayerScores(summary: GameSummary): PlayerScore[] {
  const scores = new Map<string, { correct: number; incorrect: number; powers: number; points: number }>();
  for (const player of summary.players) {
    scores.set(player.id, { correct: 0, incorrect: 0, powers: 0, points: 0 });
  }
  for (const record of summary.questions) {
    for (const buzz of record.buzzes) {
      const entry = scores.get(buzz.playerId);
      if (!entry) continue;
      const directive = normalizeDirective(buzz.result);
      if (directive === 'accept') {
        entry.correct += 1;
        if (buzz.isPower) {
          entry.powers += 1;
          entry.points += SCORING.POWER;
        } else {
          entry.points += SCORING.CORRECT;
        }
      } else if (directive === 'incorrect') {
        entry.incorrect += 1;
        entry.points += SCORING.INCORRECT;
      }
    }
  }
  return summary.players
    .map((player) => {
      const score = scores.get(player.id)!;
      const total = score.correct + score.incorrect;
      return {
        id: player.id,
        name: player.name,
        status: (player.status ?? 'active') as 'active' | 'left',
        ...score,
        accuracy: total > 0 ? score.correct / total : 0,
      };
    })
    .sort((a, b) => b.points - a.points);
}

export function buzzPointDelta(buzz: { result?: AnswerResult; isPower?: boolean }): number {
  const directive = normalizeDirective(buzz.result);
  if (directive === 'accept') return buzz.isPower ? SCORING.POWER : SCORING.CORRECT;
  if (directive === 'incorrect') return SCORING.INCORRECT;
  return 0;
}

export function buzzLabel(buzz: { isPower?: boolean; timedOut?: boolean }): string | null {
  if (buzz.isPower) return 'POWER';
  if (buzz.timedOut) return 'TIMEOUT';
  return null;
}
