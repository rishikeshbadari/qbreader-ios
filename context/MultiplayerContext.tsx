import { nanoid } from 'nanoid/non-secure';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import checkAnswer from 'qb-answer-checker';

import type {
  Buzz,
  GameEvent,
  GameSettings,
  GameSummary,
  Player,
  SessionStatus,
} from '@/types/multiplayer';
import type { AnswerResult, Tossup } from '@/types/qb';
import { createTransport, type MultiplayerTransport } from '@/services/multiplayer/transport';
import { fetchRandomTossup } from '@/services/qbreader';

// ─────────────────────────────────────────────────────────────────────────────
// Context Type
// ─────────────────────────────────────────────────────────────────────────────

type MultiplayerContextValue = {
  // State
  sessionId: string | null;
  status: SessionStatus;
  players: Player[];
  settings: GameSettings | null;
  currentQuestion: Tossup | null;
  currentResult: AnswerResult | null;
  isLoading: boolean;
  isBuzzLocked: boolean;
  summary: GameSummary | null;
  selfPlayer: Player | null;

  // Actions
  hostGame: (settings: GameSettings, playerName: string) => Promise<string>;
  joinGame: (sessionId: string, playerName: string) => Promise<void>;
  startNextQuestion: () => Promise<void>;
  submitAnswer: (answer: string) => Promise<void>;
  pauseGame: () => Promise<void>;
  updateSettings: (settings: GameSettings) => void;
  endGame: () => Promise<void>;
};

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function MultiplayerProvider({ children }: PropsWithChildren) {
  // Transport
  const transportRef = useRef<MultiplayerTransport>(createTransport());

  // Core state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Tossup | null>(null);
  const [currentResult, setCurrentResult] = useState<AnswerResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBuzzLocked, setIsBuzzLocked] = useState(false);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [selfPlayer, setSelfPlayer] = useState<Player | null>(null);

  // Refs for accessing current values in callbacks
  const stateRef = useRef({ players, settings, currentQuestion, currentResult, selfPlayer });
  stateRef.current = { players, settings, currentQuestion, currentResult, selfPlayer };

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  const isCoordinator = useCallback(() => {
    const { players, selfPlayer } = stateRef.current;
    if (players.length === 0 || !selfPlayer) return false;
    const sorted = [...players].sort((a, b) => a.id.localeCompare(b.id));
    return sorted[0].id === selfPlayer.id;
  }, []);

  const send = useCallback(async (event: GameEvent) => {
    try {
      await transportRef.current.send(event);
    } catch (err) {
      console.error('Failed to send event:', err);
    }
  }, []);

  const resetState = useCallback(() => {
    setSessionId(null);
    setStatus('idle');
    setPlayers([]);
    setSettings(null);
    setCurrentQuestion(null);
    setCurrentResult(null);
    setIsLoading(false);
    setIsBuzzLocked(false);
    setSummary(null);
    setSelfPlayer(null);
  }, []);

  const addQuestionToSummary = useCallback((tossup: Tossup) => {
    setSummary(prev => {
      if (!prev) return prev;
      const lastQ = prev.questions[prev.questions.length - 1];
      if (lastQ?.question.id === tossup.id) return prev;
      return { ...prev, questions: [...prev.questions, { question: tossup, buzzes: [] }] };
    });
  }, []);

  const addBuzzToSummary = useCallback((buzz: Buzz) => {
    setSummary(prev => {
      if (!prev || prev.questions.length === 0) return prev;
      const questions = [...prev.questions];
      const lastIdx = questions.length - 1;
      const lastQ = questions[lastIdx];
      const existingIdx = lastQ.buzzes.findIndex(b => b.playerId === buzz.playerId);
      const buzzes = existingIdx >= 0
        ? lastQ.buzzes.map((b, i) => i === existingIdx ? buzz : b)
        : [...lastQ.buzzes, buzz];
      questions[lastIdx] = { ...lastQ, buzzes, winnerId: buzz.result ? buzz.playerId : lastQ.winnerId };
      return { ...prev, questions };
    });
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Question/Answer Logic
  // ───────────────────────────────────────────────────────────────────────────

  const fetchAndBroadcastQuestion = useCallback(async () => {
    const { settings } = stateRef.current;
    if (!settings) return;

    setIsLoading(true);
    setCurrentResult(null);
    setIsBuzzLocked(false);

    try {
      const tossup = await fetchRandomTossup(new AbortController().signal, {
        difficulties: settings.difficulties,
        categories: settings.categories,
      });
      setCurrentQuestion(tossup);
      addQuestionToSummary(tossup);
      setStatus('playing');
      await send({ type: 'question:new', tossup });
    } catch (err) {
      console.error('Failed to fetch question:', err);
    } finally {
      setIsLoading(false);
    }
  }, [send, addQuestionToSummary]);

  const judgeAndBroadcastResult = useCallback(async (buzz: Buzz) => {
    const { currentQuestion, currentResult } = stateRef.current;
    if (!currentQuestion || currentResult) return;

    setIsBuzzLocked(true);
    await send({ type: 'buzz:lock', playerId: buzz.playerId });

    const result = checkAnswer(
      currentQuestion.answerHtml || currentQuestion.answer,
      buzz.answer.trim()
    ) as AnswerResult;

    const resultBuzz: Buzz = { ...buzz, result };
    setCurrentResult(result);
    addBuzzToSummary(resultBuzz);
    await send({ type: 'buzz:result', buzz: resultBuzz });
  }, [send, addBuzzToSummary]);

  // ───────────────────────────────────────────────────────────────────────────
  // Event Handler
  // ───────────────────────────────────────────────────────────────────────────

  const handleEvent = useCallback((event: GameEvent) => {
    switch (event.type) {
      case 'player:join': {
        setPlayers(prev => prev.some(p => p.id === event.player.id) ? prev : [...prev, event.player]);
        setSummary(prev => prev && !prev.players.some(p => p.id === event.player.id)
          ? { ...prev, players: [...prev.players, event.player] }
          : prev
        );
        // Coordinator syncs state to new player
        if (isCoordinator()) {
          const { players, settings, currentQuestion } = stateRef.current;
          void send({ type: 'players:sync', players: [...players, event.player] });
          if (settings) void send({ type: 'game:start', settings });
          if (currentQuestion) void send({ type: 'question:new', tossup: currentQuestion });
        }
        break;
      }

      case 'player:leave': {
        setPlayers(prev => prev.filter(p => p.id !== event.playerId));
        setSummary(prev => prev ? { ...prev, players: prev.players.filter(p => p.id !== event.playerId) } : prev);
        break;
      }

      case 'players:sync': {
        setPlayers(prev => {
          const merged = [...prev];
          event.players.forEach(p => {
            if (!merged.some(m => m.id === p.id)) merged.push(p);
          });
          return merged;
        });
        break;
      }

      case 'game:start': {
        setSettings(event.settings);
        setStatus('playing');
        setIsBuzzLocked(false);
        setCurrentResult(null);
        break;
      }

      case 'game:pause': {
        setStatus('lobby');
        setIsBuzzLocked(true);
        break;
      }

      case 'game:end': {
        setStatus('ended');
        setIsBuzzLocked(true);
        setSummary(prev => prev ? { ...prev, endedAt: Date.now() } : prev);
        break;
      }

      case 'question:new': {
        setCurrentQuestion(event.tossup);
        setCurrentResult(null);
        setIsBuzzLocked(false);
        setStatus('playing');
        addQuestionToSummary(event.tossup);
        break;
      }

      case 'question:request': {
        // Only coordinator fetches questions
        if (isCoordinator()) {
          void fetchAndBroadcastQuestion();
        }
        break;
      }

      case 'buzz:lock': {
        setIsBuzzLocked(true);
        break;
      }

      case 'buzz:submit': {
        // Only coordinator judges answers
        if (isCoordinator()) {
          void judgeAndBroadcastResult(event.buzz);
        }
        break;
      }

      case 'buzz:result': {
        setCurrentResult(event.buzz.result ?? null);
        setIsBuzzLocked(true);
        addBuzzToSummary(event.buzz);
        break;
      }
    }
  }, [isCoordinator, send, addQuestionToSummary, addBuzzToSummary, fetchAndBroadcastQuestion, judgeAndBroadcastResult]);

  // ───────────────────────────────────────────────────────────────────────────
  // Public Actions
  // ───────────────────────────────────────────────────────────────────────────

  const hostGame = useCallback(async (gameSettings: GameSettings, playerName: string) => {
    await transportRef.current.disconnect();
    transportRef.current = createTransport();
    resetState();

    const id = nanoid(8);
    const player: Player = { id: nanoid(6), name: playerName || 'Player' };

    setSessionId(id);
    setStatus('lobby');
    setSettings(gameSettings);
    setPlayers([player]);
    setSelfPlayer(player);
    setSummary({ sessionId: id, players: [player], settings: gameSettings, questions: [] });

    await transportRef.current.startHosting(id, {
      onEvent: handleEvent,
      onError: err => console.error('Transport error:', err),
    });

    await send({ type: 'player:join', player });
    return id;
  }, [handleEvent, resetState, send]);

  const joinGame = useCallback(async (id: string, playerName: string) => {
    await transportRef.current.disconnect();
    transportRef.current = createTransport();
    resetState();

    const player: Player = { id: nanoid(6), name: playerName || 'Player' };

    setSessionId(id);
    setStatus('lobby');
    setPlayers([player]);
    setSelfPlayer(player);

    await transportRef.current.joinSession(id, {
      onEvent: handleEvent,
      onError: err => console.error('Transport error:', err),
    });

    await send({ type: 'player:join', player });
  }, [handleEvent, resetState, send]);

  const startNextQuestion = useCallback(async () => {
    if (isLoading) return;

    if (isCoordinator()) {
      await fetchAndBroadcastQuestion();
    } else {
      await send({ type: 'question:request' });
    }
  }, [isLoading, isCoordinator, fetchAndBroadcastQuestion, send]);

  const submitAnswer = useCallback(async (answer: string) => {
    const { selfPlayer, currentQuestion, currentResult } = stateRef.current;
    if (!currentQuestion || currentResult || !selfPlayer) return;

    setIsBuzzLocked(true);
    const buzz: Buzz = { playerId: selfPlayer.id, timestamp: Date.now(), answer };

    if (isCoordinator()) {
      await judgeAndBroadcastResult(buzz);
    } else {
      await send({ type: 'buzz:lock', playerId: selfPlayer.id });
      await send({ type: 'buzz:submit', buzz });
    }
  }, [isCoordinator, judgeAndBroadcastResult, send]);

  const pauseGame = useCallback(async () => {
    setStatus('lobby');
    setIsBuzzLocked(true);
    await send({ type: 'game:pause' });
  }, [send]);

  const updateSettings = useCallback((newSettings: GameSettings) => {
    setSettings(newSettings);
    setSummary(prev => prev ? { ...prev, settings: newSettings } : prev);
  }, []);

  const endGame = useCallback(async () => {
    const { selfPlayer } = stateRef.current;
    if (selfPlayer) {
      await send({ type: 'player:leave', playerId: selfPlayer.id });
    }
    await transportRef.current.disconnect();
    setStatus('ended');
    setSummary(prev => prev ? { ...prev, endedAt: Date.now() } : prev);
  }, [send]);

  // ───────────────────────────────────────────────────────────────────────────
  // Context Value
  // ───────────────────────────────────────────────────────────────────────────

  const value = useMemo<MultiplayerContextValue>(() => ({
    sessionId,
    status,
    players,
    settings,
    currentQuestion,
    currentResult,
    isLoading,
    isBuzzLocked,
    summary,
    selfPlayer,
    hostGame,
    joinGame,
    startNextQuestion,
    submitAnswer,
    pauseGame,
    updateSettings,
    endGame,
  }), [
    sessionId, status, players, settings, currentQuestion, currentResult,
    isLoading, isBuzzLocked, summary, selfPlayer,
    hostGame, joinGame, startNextQuestion, submitAnswer, pauseGame, updateSettings, endGame,
  ]);

  return (
    <MultiplayerContext.Provider value={value}>
      {children}
    </MultiplayerContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useMultiplayer() {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) throw new Error('useMultiplayer must be used within MultiplayerProvider');
  return ctx;
}
