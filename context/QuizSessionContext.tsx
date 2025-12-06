import checkAnswer from 'qb-answer-checker';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { fetchRandomTossup } from '@/services/qbreader';
import { useSettings } from '@/hooks/useSettings';
import type { AnswerResult, SessionHistoryEntry, Tossup } from '@/types/qb';

interface QuizSessionContextValue {
  currentQuestion?: Tossup;
  loadingQuestion: boolean;
  error?: string;
  history: SessionHistoryEntry[];
  lastResult?: AnswerResult;
  loadNextQuestion: () => Promise<void>;
  judgeAnswer: (answer: string) => void;
  skipQuestion: () => void;
  clearError: () => void;
}

const QuizSessionContext = createContext<QuizSessionContextValue | undefined>(
  undefined
);

export function QuizSessionProvider({ children }: PropsWithChildren) {
  const abortRef = useRef<AbortController | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Tossup>();
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [history, setHistory] = useState<SessionHistoryEntry[]>([]);
  const [error, setError] = useState<string>();
  const [lastResult, setLastResult] = useState<AnswerResult>();
  const { selectedDifficulties, selectedCategories } = useSettings();

  const clearError = useCallback(() => setError(undefined), []);

  const loadNextQuestion = useCallback(async () => {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setLoadingQuestion(true);
    setError(undefined);
    setLastResult(undefined);

    try {
      const filters = {
        difficulties:
          selectedDifficulties.length > 0 ? selectedDifficulties : undefined,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      };
      const tossup = await fetchRandomTossup(abortController.signal, filters);
      setCurrentQuestion(tossup);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }

      console.error('Failed to fetch tossup', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong while loading a question.'
      );
    } finally {
      setLoadingQuestion(false);
    }
  }, [selectedCategories, selectedDifficulties]);

  const judgeAnswer = useCallback(
    (answer: string) => {
      if (!currentQuestion) {
        return;
      }

      const sanitizedAnswer = answer.trim();
      const answerline = currentQuestion.answerHtml || currentQuestion.answer;

      const result = checkAnswer(
        answerline,
        sanitizedAnswer
      ) as AnswerResult;

      setLastResult(result);
      setHistory((prev) => [
        {
          id: `${currentQuestion.id}-${Date.now()}`,
          tossup: currentQuestion,
          userAnswer: sanitizedAnswer,
          result,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    },
    [currentQuestion]
  );

  const skipQuestion = useCallback(() => {
    if (!currentQuestion) {
      return;
    }

    const timestamp = Date.now();
    setHistory((prev) => [
      {
        id: `${currentQuestion.id}-${timestamp}-skip`,
        tossup: currentQuestion,
        userAnswer: '',
        result: { directive: 'skip' },
        timestamp,
      },
      ...prev,
    ]);
  }, [currentQuestion]);

  const value = useMemo(
    () => ({
      currentQuestion,
      loadingQuestion,
      error,
      history,
      lastResult,
      loadNextQuestion,
      judgeAnswer,
      skipQuestion,
      clearError,
    }),
    [
      clearError,
      currentQuestion,
      error,
      history,
      judgeAnswer,
      skipQuestion,
      lastResult,
      loadNextQuestion,
      loadingQuestion,
    ]
  );

  return (
    <QuizSessionContext.Provider value={value}>
      {children}
    </QuizSessionContext.Provider>
  );
}

export function useQuizSessionContext() {
  const context = useContext(QuizSessionContext);

  if (!context) {
    throw new Error('useQuizSessionContext must be used within the provider');
  }

  return context;
}
