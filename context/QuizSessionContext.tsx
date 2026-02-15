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

const MAX_HISTORY_ENTRIES = 200;

interface QuizSessionContextValue {
  currentQuestion?: Tossup;
  loadingQuestion: boolean;
  error?: string;
  history: SessionHistoryEntry[];
  lastResult?: AnswerResult;
  promptInfo?: { directedPrompt?: string } | null;
  loadNextQuestion: () => Promise<void>;
  judgeAnswer: (answer: string) => void;
  skipQuestion: () => void;
  clearError: () => void;
}

const QuizSessionContext = createContext<QuizSessionContextValue | undefined>(
  undefined
);

/**
 * Provides quiz session state (current question, results, history) and actions
 * to fetch new tossups, judge answers, and manage errors.
 */
export function QuizSessionProvider({ children }: PropsWithChildren) {
  const abortRef = useRef<AbortController | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Tossup>();
  const [nextQuestions, setNextQuestions] = useState<Tossup[]>([]);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [history, setHistory] = useState<SessionHistoryEntry[]>([]);
  const [error, setError] = useState<string>();
  const [lastResult, setLastResult] = useState<AnswerResult>();
  const [promptInfo, setPromptInfo] = useState<{ directedPrompt?: string } | null>(null);
  const promptedRef = useRef(false);
  const { selectedDifficulties, selectedCategories } = useSettings();

  const clearError = useCallback(() => setError(undefined), []);

  /**
   * Build request filters from current user selections, omitting empty arrays.
   */
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

  /**
   * Preload additional tossups into a queue to keep gameplay responsive.
   */
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
        const filters = buildFilters();
        const incoming = await Promise.all(
          Array.from({ length: needed }, () =>
            fetchRandomTossup(prefetchController.signal, filters)
          )
        );
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

  /**
   * Pop the next queued tossup (or fetch one) and update current state.
   */
  const loadNextQuestion = useCallback(async () => {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setLoadingQuestion(true);
    setError(undefined);
    setLastResult(undefined);
    setPromptInfo(null);
    promptedRef.current = false;

    const queuedQuestions = nextQuestionsRef.current;
    if (queuedQuestions.length > 0) {
      const [next, ...rest] = queuedQuestions;
      nextQuestionsRef.current = rest;
      setCurrentQuestion(next);
      setNextQuestions(rest);
      setLoadingQuestion(false);
      void primeNextQuestion(2, rest.length);
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
  }, [buildFilters, primeNextQuestion]);

  /**
   * Judge a user's answer against the current tossup and append to history.
   */
  const judgeAnswer = useCallback(
    (answer: string) => {
      if (!currentQuestion) {
        return;
      }

      const sanitizedAnswer = answer.trim();
      const answerline = currentQuestion.answerHtml || currentQuestion.answer;

      let result: AnswerResult;
      try {
        result = checkAnswer(answerline, sanitizedAnswer) as AnswerResult;
      } catch (err) {
        console.error('Failed to judge answer', err);
        setError('Unable to check that answer. Please try again.');
        return;
      }

      // Handle prompts: give the player one more chance to be more specific
      if (result.directive === 'prompt' && !promptedRef.current) {
        promptedRef.current = true;
        setPromptInfo({ directedPrompt: result.directedPrompt });
        return;
      }

      // Second prompt → treat as reject
      if (result.directive === 'prompt') {
        result = { ...result, directive: 'reject' };
      }

      promptedRef.current = false;
      setPromptInfo(null);

      setLastResult(result);
      setHistory((prev) => {
        const next = [
          {
            id: `${currentQuestion.id}-${Date.now()}`,
            tossup: currentQuestion,
            userAnswer: sanitizedAnswer,
            result,
            timestamp: Date.now(),
          },
          ...prev,
        ];
        return next.length > MAX_HISTORY_ENTRIES ? next.slice(0, MAX_HISTORY_ENTRIES) : next;
      });
    },
    [currentQuestion]
  );

  /**
   * Record a skipped question in history without triggering a judgment.
   */
  const skipQuestion = useCallback(() => {
    if (!currentQuestion) {
      return;
    }

    promptedRef.current = false;
    setPromptInfo(null);

    const timestamp = Date.now();
    setHistory((prev) => {
      const next = [
        {
          id: `${currentQuestion.id}-${timestamp}-skip`,
          tossup: currentQuestion,
          userAnswer: '',
          result: { directive: 'skip' },
          timestamp,
        },
        ...prev,
      ];
      return next.length > MAX_HISTORY_ENTRIES ? next.slice(0, MAX_HISTORY_ENTRIES) : next;
    });
  }, [currentQuestion]);

  const value = useMemo(
    () => ({
      currentQuestion,
      loadingQuestion,
      error,
      history,
      lastResult,
      promptInfo,
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
      promptInfo,
      loadNextQuestion,
      loadingQuestion,
    ]
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
      prefetchAbortRef.current?.abort();
    },
    []
  );

  return (
    <QuizSessionContext.Provider value={value}>
      {children}
    </QuizSessionContext.Provider>
  );
}

/**
 * Read the quiz session context, throwing if used outside the provider.
 */
export function useQuizSessionContext() {
  const context = useContext(QuizSessionContext);

  if (!context) {
    throw new Error('useQuizSessionContext must be used within the provider');
  }

  return context;
}
