import { useMemo } from 'react';

import type { SessionStats } from '@/types/qb';
import { useQuizSession } from '@/hooks/useQuizSession';

export function useSessionStats(): SessionStats {
  const { history } = useQuizSession();

  return useMemo(() => {
    let correct = 0;
    let prompts = 0;
    let incorrect = 0;
    let skipped = 0;

    history.forEach((entry) => {
      const directive = entry.result.directive.toLowerCase();
      if (directive === 'accept') {
        correct += 1;
      } else if (directive === 'prompt') {
        prompts += 1;
      } else if (directive === 'skip') {
        skipped += 1;
      } else {
        incorrect += 1;
      }
    });

    let streak = 0;
    for (const entry of history) {
      const directive = entry.result.directive.toLowerCase();
      if (directive === 'accept') {
        streak += 1;
      } else {
        break;
      }
    }

    const total = history.length;
    const accuracy = total === 0 ? 0 : correct / total;

    return {
      total,
      correct,
      prompts,
      incorrect,
      skipped,
      accuracy,
      streak,
    };
  }, [history]);
}
