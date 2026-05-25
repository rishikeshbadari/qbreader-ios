import { useMemo } from 'react';

import type { SessionStats } from '@/types/qb';
import { useQuizSession } from '@/hooks/useQuizSession';
import { calculateSessionStats } from '@/utils/sessionStats';

/**
 * Derive aggregate session statistics (accuracy, streaks, counts) from the
 * current quiz session history.
 */
export function useSessionStats(): SessionStats {
  const { history } = useQuizSession();

  return useMemo(() => {
    return calculateSessionStats(history);
  }, [history]);
}
