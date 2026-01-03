import { useQuizSessionContext } from '@/context/QuizSessionContext';

/**
 * Convenience hook to access the quiz session context with proper typing.
 */
export function useQuizSession() {
  return useQuizSessionContext();
}
