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

import { fetchRandomTossups } from '@/services/qbreader';
import { useSettings } from '@/hooks/useSettings';
import type { AnswerResult, SessionHistoryEntry, Tossup } from '@/types/qb';

const MAX_HISTORY_ENTRIES = 200;
const PREFETCH_TARGET = 10;
const PREFETCH_LOW_WATER = 3;
const SETTINGS_PREFETCH_DEBOUNCE_MS = 300;

interface QuizSessionContextValue {
  currentQuestion?: Tossup;
  loadingQuestion: boolean;
  error?: string;
  history: SessionHistoryEntry[];
  lastResult?: AnswerResult;
  lastAnswer?: string;
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
  const fastPrefetchAbortRef = useRef<AbortController | null>(null);
  const fastPrefetchKeyRef = useRef<string | null>(null);
  const fastPrefetchPromiseRef = useRef<Promise<void> | null>(null);
  const batchPrefetchAbortRef = useRef<AbortController | null>(null);
  const batchPrefetchKeyRef = useRef<string | null>(null);
  const batchPrefetchPromiseRef = useRef<Promise<void> | null>(null);
  const settingsPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStartedInitialPrefetchRef = useRef(false);
  const [currentQuestion, setCurrentQuestion] = useState<Tossup>();
  const [nextQuestions, setNextQuestions] = useState<Tossup[]>([]);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [history, setHistory] = useState<SessionHistoryEntry[]>([]);
  const [error, setError] = useState<string>();
  const [lastResult, setLastResult] = useState<AnswerResult>();
  const [lastAnswer, setLastAnswer] = useState<string>();
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
  const seenQuestionIdsRef = useRef<Set<string>>(new Set());

  const buildFiltersKey = useCallback((filters: ReturnType<typeof buildFilters>) => {
    const difficulties = filters.difficulties ? [...filters.difficulties].sort((a, b) => a - b) : [];
    const categories = filters.categories ? [...filters.categories].sort() : [];
    return `${difficulties.join(',')}|${categories.join(',')}`;
  }, []);

  const isLatestFiltersKey = useCallback((key: string) => {
    return buildFiltersKey(buildFilters()) === key;
  }, [buildFilters, buildFiltersKey]);

  const enqueueQuestions = useCallback((incoming: Tossup[], key: string) => {
    if (!isLatestFiltersKey(key)) {
      return [];
    }

    const uniqueQuestions: Tossup[] = [];
    for (const question of incoming) {
      if (seenQuestionIdsRef.current.has(question.id)) {
        continue;
      }
      seenQuestionIdsRef.current.add(question.id);
      uniqueQuestions.push(question);
    }

    if (uniqueQuestions.length === 0) {
      return [];
    }

    const merged = [...nextQuestionsRef.current, ...uniqueQuestions];
    nextQuestionsRef.current = merged;
    setNextQuestions(merged);
    return uniqueQuestions;
  }, [isLatestFiltersKey]);

  const popQueuedQuestion = useCallback(() => {
    const [next, ...rest] = nextQuestionsRef.current;
    if (!next) {
      return undefined;
    }

    nextQuestionsRef.current = rest;
    setNextQuestions(rest);
    return next;
  }, []);

  const showQuestion = useCallback((question: Tossup) => {
    seenQuestionIdsRef.current.add(question.id);
    setCurrentQuestion(question);
  }, []);

  const abortFastPrefetch = useCallback(() => {
    fastPrefetchAbortRef.current?.abort();
    fastPrefetchAbortRef.current = null;
    fastPrefetchKeyRef.current = null;
    fastPrefetchPromiseRef.current = null;
  }, []);

  const abortBatchPrefetch = useCallback(() => {
    batchPrefetchAbortRef.current?.abort();
    batchPrefetchAbortRef.current = null;
    batchPrefetchKeyRef.current = null;
    batchPrefetchPromiseRef.current = null;
  }, []);

  const startFastPrefetch = useCallback((force = false) => {
    const filters = buildFilters();
    const key = buildFiltersKey(filters);

    if (!force && nextQuestionsRef.current.length > 0) {
      return fastPrefetchPromiseRef.current ?? Promise.resolve();
    }

    if (fastPrefetchKeyRef.current === key && fastPrefetchPromiseRef.current) {
      return fastPrefetchPromiseRef.current;
    }

    if (force || fastPrefetchKeyRef.current !== key) {
      abortFastPrefetch();
    }

    const controller = new AbortController();
    fastPrefetchAbortRef.current = controller;
    fastPrefetchKeyRef.current = key;

    const promise = (async () => {
      try {
        const incoming = await fetchRandomTossups(1, controller.signal, filters);
        if (controller.signal.aborted) {
          return;
        }

        enqueueQuestions(incoming, key);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        console.error('Failed to prefetch fast tossup', err);
      } finally {
        if (fastPrefetchAbortRef.current === controller) {
          fastPrefetchAbortRef.current = null;
          fastPrefetchKeyRef.current = null;
          fastPrefetchPromiseRef.current = null;
        }
      }
    })();

    fastPrefetchPromiseRef.current = promise;
    return promise;
  }, [abortFastPrefetch, buildFilters, buildFiltersKey, enqueueQuestions]);

  const startBatchPrefetch = useCallback((force = false) => {
    const filters = buildFilters();
    const key = buildFiltersKey(filters);
    const currentLength = nextQuestionsRef.current.length;

    if (!force && currentLength > PREFETCH_LOW_WATER) {
      return batchPrefetchPromiseRef.current ?? Promise.resolve();
    }

    const needed = PREFETCH_TARGET - currentLength;
    if (needed <= 0) {
      return batchPrefetchPromiseRef.current ?? Promise.resolve();
    }

    if (batchPrefetchKeyRef.current === key && batchPrefetchPromiseRef.current) {
      return batchPrefetchPromiseRef.current;
    }

    if (force || batchPrefetchKeyRef.current !== key) {
      abortBatchPrefetch();
    }

    const controller = new AbortController();
    batchPrefetchAbortRef.current = controller;
    batchPrefetchKeyRef.current = key;

    const promise = (async () => {
      try {
        const incoming = await fetchRandomTossups(needed, controller.signal, filters);
        if (controller.signal.aborted) {
          return;
        }

        const queued = enqueueQuestions(incoming, key);
        if (queued.length > 0 && fastPrefetchKeyRef.current === key) {
          abortFastPrefetch();
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        console.error('Failed to prefetch tossups', err);
      } finally {
        if (batchPrefetchAbortRef.current === controller) {
          batchPrefetchAbortRef.current = null;
          batchPrefetchKeyRef.current = null;
          batchPrefetchPromiseRef.current = null;
        }
      }
    })();

    batchPrefetchPromiseRef.current = promise;
    return promise;
  }, [abortBatchPrefetch, abortFastPrefetch, buildFilters, buildFiltersKey, enqueueQuestions]);

  const ensurePrefetched = useCallback((force = false) => {
    const key = buildFiltersKey(buildFilters());
    const hasBatchInFlight = batchPrefetchKeyRef.current === key && Boolean(batchPrefetchPromiseRef.current);

    if (force || (nextQuestionsRef.current.length === 0 && !hasBatchInFlight)) {
      void startFastPrefetch(force);
    }

    void startBatchPrefetch(force);
  }, [buildFilters, buildFiltersKey, startBatchPrefetch, startFastPrefetch]);

  const waitForPrefetchedQuestion = useCallback(async (key: string, signal: AbortSignal) => {
    while (!signal.aborted) {
      const queuedQuestion = popQueuedQuestion();
      if (queuedQuestion) {
        return queuedQuestion;
      }

      const pendingPromises: Promise<void>[] = [];
      if (fastPrefetchKeyRef.current === key && fastPrefetchPromiseRef.current) {
        pendingPromises.push(fastPrefetchPromiseRef.current);
      }
      if (batchPrefetchKeyRef.current === key && batchPrefetchPromiseRef.current) {
        pendingPromises.push(batchPrefetchPromiseRef.current);
      }

      if (pendingPromises.length === 0) {
        return undefined;
      }

      await Promise.race(pendingPromises.map((promise) => promise.catch(() => undefined)));
    }

    return undefined;
  }, [popQueuedQuestion]);

  useEffect(() => {
    abortRef.current?.abort();
    abortFastPrefetch();
    abortBatchPrefetch();

    if (settingsPrefetchTimerRef.current) {
      clearTimeout(settingsPrefetchTimerRef.current);
      settingsPrefetchTimerRef.current = null;
    }

    setCurrentQuestion(undefined);
    setLastResult(undefined);
    setLastAnswer(undefined);
    setPromptInfo(null);
    promptedRef.current = false;
    nextQuestionsRef.current = [];
    setNextQuestions([]);

    const startWarmup = () => {
      settingsPrefetchTimerRef.current = null;
      hasStartedInitialPrefetchRef.current = true;
      ensurePrefetched(true);
    };

    if (hasStartedInitialPrefetchRef.current) {
      settingsPrefetchTimerRef.current = setTimeout(startWarmup, SETTINGS_PREFETCH_DEBOUNCE_MS);
    } else {
      startWarmup();
    }

    return () => {
      if (settingsPrefetchTimerRef.current) {
        clearTimeout(settingsPrefetchTimerRef.current);
        settingsPrefetchTimerRef.current = null;
      }
    };
  }, [abortBatchPrefetch, abortFastPrefetch, ensurePrefetched, selectedCategories, selectedDifficulties]);

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
    setLastAnswer(undefined);
    setPromptInfo(null);
    promptedRef.current = false;

    const filters = buildFilters();
    const currentFiltersKey = buildFiltersKey(filters);
    let nextQuestion = popQueuedQuestion();
    if (nextQuestion) {
      showQuestion(nextQuestion);
      setLoadingQuestion(false);
      ensurePrefetched();
      return;
    }

    void startFastPrefetch();
    void startBatchPrefetch();
    try {
      nextQuestion = await waitForPrefetchedQuestion(currentFiltersKey, abortController.signal);
      if (abortController.signal.aborted) {
        return;
      }

      if (nextQuestion) {
        showQuestion(nextQuestion);
        setLoadingQuestion(false);
        ensurePrefetched();
        return;
      }

      const [first] = await fetchRandomTossups(1, abortController.signal, filters);
      if (abortController.signal.aborted || !isLatestFiltersKey(currentFiltersKey)) {
        return;
      }

      showQuestion(first);
      void startBatchPrefetch(true);
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
  }, [
    buildFilters,
    buildFiltersKey,
    ensurePrefetched,
    isLatestFiltersKey,
    popQueuedQuestion,
    showQuestion,
    startBatchPrefetch,
    startFastPrefetch,
    waitForPrefetchedQuestion,
  ]);

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
      if (sanitizedAnswer.length === 0) {
        result = { directive: 'skip' };
      } else {
        try {
          result = checkAnswer(answerline, sanitizedAnswer) as AnswerResult;
        } catch (err) {
          console.error('Failed to judge answer', err);
          setError('Unable to check that answer. Please try again.');
          return;
        }
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
      setLastAnswer(sanitizedAnswer);
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
    setLastAnswer('');
  }, [currentQuestion]);

  const value = useMemo(
    () => ({
      currentQuestion,
      loadingQuestion,
      error,
      history,
      lastResult,
      lastAnswer,
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
      lastAnswer,
      promptInfo,
      loadNextQuestion,
      loadingQuestion,
    ]
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortFastPrefetch();
      abortBatchPrefetch();
      if (settingsPrefetchTimerRef.current) {
        clearTimeout(settingsPrefetchTimerRef.current);
      }
    },
    [abortBatchPrefetch, abortFastPrefetch]
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
