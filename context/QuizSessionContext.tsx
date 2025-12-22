import checkAnswer from 'qb-answer-checker';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
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
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Tossup>();
  const [nextQuestions, setNextQuestions] = useState<Tossup[]>([]);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [history, setHistory] = useState<SessionHistoryEntry[]>([]);
  const [error, setError] = useState<string>();
  const [lastResult, setLastResult] = useState<AnswerResult>();
  const { selectedDifficulties, selectedCategories } = useSettings();

  const clearError = useCallback(() => setError(undefined), []);

  const buildFilters = useCallback(() => {
    return {
      difficulties: selectedDifficulties.length > 0 ? selectedDifficulties : undefined,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
    };
  }, [selectedCategories, selectedDifficulties]);

  const nextQuestionsRef = useRef<Tossup[]>([]);

  useEffect(() => {
    nextQuestionsRef.current = nextQuestions;
  }, [nextQuestions]);

  const primeNextQuestion = useCallback(
    async (desiredLength = 2, existingLength?: number) => {
      prefetchAbortRef.current?.abort();
      const prefetchController = new AbortController();
      prefetchAbortRef.current = prefetchController;

      try {
        const currentLength =
          typeof existingLength === 'number'
            ? existingLength
            : nextQuestionsRef.current.length;
        const needed = desiredLength - currentLength;
        if (needed <= 0) {
          return;
        }
        const incoming: Tossup[] = [];
        for (let i = 0; i < needed; i += 1) {
          const tossup = await fetchRandomTossup(prefetchController.signal, buildFilters());
          incoming.push(tossup);
        }
        setNextQuestions((prev) => [...prev, ...incoming]);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        console.error('Failed to prefetch tossup', err);
      }
    },
    [buildFilters]
  );

  useEffect(() => {
    void primeNextQuestion(2);

    return () => {
      prefetchAbortRef.current?.abort();
    };
  }, [primeNextQuestion]);

  useEffect(() => {
    setNextQuestions([]);
    setCurrentQuestion(undefined);
    void primeNextQuestion(2, 0);
  }, [selectedCategories, selectedDifficulties, primeNextQuestion]);

  const loadNextQuestion = useCallback(async () => {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setLoadingQuestion(true);
    setError(undefined);
    setLastResult(undefined);

    if (nextQuestions.length > 0) {
      setCurrentQuestion(nextQuestions[0]);
      setNextQuestions((prev) => prev.slice(1));
      setLoadingQuestion(false);
      void primeNextQuestion(2, nextQuestions.length - 1);
      return;
    }

    prefetchAbortRef.current?.abort();

    try {
      const tossup = await fetchRandomTossup(abortController.signal, buildFilters());
      setCurrentQuestion(tossup);
      void primeNextQuestion(2);
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
  }, [buildFilters, nextQuestions, primeNextQuestion]);

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
