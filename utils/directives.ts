import type { AnswerResult } from '@/types/qb';

export type NormalizedDirective = 'accept' | 'prompt' | 'skip' | 'incorrect';

/**
 * Normalize an answer directive string to a stable, limited set of values.
 */
export function normalizeDirective(
  result?: Pick<AnswerResult, 'directive'> | null
): NormalizedDirective {
  const directive = typeof result?.directive === 'string'
    ? result.directive.trim().toLowerCase()
    : '';

  if (directive === 'accept') {
    return 'accept';
  }

  if (directive === 'prompt') {
    return 'prompt';
  }

  if (directive === 'skip') {
    return 'skip';
  }

  return 'incorrect';
}

/**
 * Convert a directive into a user-facing label.
 */
export function directiveLabel(
  result?: Pick<AnswerResult, 'directive'> | null
): string {
  switch (normalizeDirective(result)) {
    case 'accept':
      return 'Correct';
    case 'prompt':
      return 'Prompt';
    case 'skip':
      return 'Skipped';
    default:
      return 'Incorrect';
  }
}
