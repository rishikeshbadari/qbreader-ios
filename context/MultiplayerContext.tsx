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
  currentBuzzer: Player | null; // Who is currently buzzing
  isLoading: boolean;
  isBuzzLocked: boolean;
  isSelfLockedOut: boolean; // True if this player already buzzed incorrectly
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
  const [currentBuzzer, setCurrentBuzzer] = useState<Player | null>(null); // Who is currently buzzing
  const [isLoading, setIsLoading] = useState(false);
  const [isBuzzLocked, setIsBuzzLocked] = useState(false);
  const [lockedOutPlayers, setLockedOutPlayers] = useState<string[]>([]); // Players who buzzed incorrectly
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [selfPlayer, setSelfPlayer] = useState<Player | null>(null);

  // Derived: is current player locked out from buzzing on this question
  const isSelfLockedOut = selfPlayer ? lockedOutPlayers.includes(selfPlayer.id) : false;

  // Refs for accessing current values in callbacks
  const stateRef = useRef({ players, settings, currentQuestion, currentResult, selfPlayer, lockedOutPlayers, summary });
  stateRef.current = { players, settings, currentQuestion, currentResult, selfPlayer, lockedOutPlayers, summary };

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
    setCurrentBuzzer(null);
    setIsLoading(false);
    setIsBuzzLocked(false);
    setLockedOutPlayers([]);
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
    setLockedOutPlayers([]); // Reset locked out players for new question

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
    const { currentQuestion, currentResult, lockedOutPlayers, players } = stateRef.current;
    if (!currentQuestion || currentResult) return;

    // Find the buzzer player for display
    const buzzerPlayer = players.find(p => p.id === buzz.playerId) ?? null;
    setCurrentBuzzer(buzzerPlayer);
    setIsBuzzLocked(true);
    await send({ type: 'buzz:lock', playerId: buzz.playerId });

    const result = checkAnswer(
      currentQuestion.answerHtml || currentQuestion.answer,
      buzz.answer.trim()
    ) as AnswerResult;

    const resultBuzz: Buzz = { ...buzz, result };
    addBuzzToSummary(resultBuzz);
    await send({ type: 'buzz:result', buzz: resultBuzz });

    // Check if answer was incorrect (not accepted)
    const isCorrect = result.directive === 'accept';
    
    if (isCorrect) {
      // Correct answer - keep buzz locked, set result
      setCurrentResult(result);
      setCurrentBuzzer(null);
    } else {
      // Incorrect answer - add player to locked out list
      const newLockedOut = [...lockedOutPlayers, buzz.playerId];
      setLockedOutPlayers(newLockedOut);
      setCurrentBuzzer(null);
      
      // Check if all players are now locked out
      const allPlayersLockedOut = players.every(p => newLockedOut.includes(p.id));
      
      if (allPlayersLockedOut) {
        // Everyone has tried and failed - show result so they can move on
        setCurrentResult(result);
        setIsBuzzLocked(true);
        await send({ type: 'buzz:unlock', lockedOutPlayers: newLockedOut, allLockedOut: true, lastResult: result });
      } else {
        // Others can still try - unlock buzzing for them
        setIsBuzzLocked(false);
        setCurrentResult(null);
        await send({ type: 'buzz:unlock', lockedOutPlayers: newLockedOut });
      }
    }
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
        // When any player leaves, end the game for everyone
        const { summary } = stateRef.current;
        setPlayers(prev => prev.filter(p => p.id !== event.playerId));
        setStatus('ended');
        setIsBuzzLocked(true);
        const finalSummary = summary ? { ...summary, endedAt: Date.now() } : null;
        setSummary(finalSummary);
        // Broadcast game end to all players with the current summary
        if (isCoordinator() && finalSummary) {
          void send({ type: 'game:end', summary: finalSummary });
        }
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
        setLockedOutPlayers([]);
        setCurrentResult(null);
        setCurrentBuzzer(null);
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
        // Use provided summary if available, otherwise update existing
        if (event.summary) {
          setSummary(event.summary);
        } else {
          setSummary(prev => prev ? { ...prev, endedAt: Date.now() } : prev);
        }
        break;
      }

      case 'question:new': {
        setCurrentQuestion(event.tossup);
        setCurrentResult(null);
        setCurrentBuzzer(null);
        setIsBuzzLocked(false);
        setLockedOutPlayers([]); // Reset locked out players for new question
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
        // Set the buzzer for display
        const { players } = stateRef.current;
        const buzzer = players.find(p => p.id === event.playerId) ?? null;
        setCurrentBuzzer(buzzer);
        break;
      }

      case 'buzz:unlock': {
        // After an incorrect answer
        setLockedOutPlayers(event.lockedOutPlayers);
        setCurrentBuzzer(null);
        
        if (event.allLockedOut && event.lastResult) {
          // Everyone has tried and failed - show result so they can move on
          setCurrentResult(event.lastResult);
          setIsBuzzLocked(true);
        } else {
          // Others can still try - unlock buzzing for them
          setIsBuzzLocked(false);
          setCurrentResult(null);
        }
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
        const isCorrect = event.buzz.result?.directive === 'accept';
        if (isCorrect) {
          setCurrentResult(event.buzz.result ?? null);
          setIsBuzzLocked(true);
        }
        // For incorrect answers, buzz:unlock event will handle the state
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
    const { selfPlayer, currentQuestion, currentResult, lockedOutPlayers } = stateRef.current;
    if (!currentQuestion || currentResult || !selfPlayer) return;
    
    // Check if player is locked out (already buzzed incorrectly)
    if (lockedOutPlayers.includes(selfPlayer.id)) return;

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
    const { selfPlayer, summary } = stateRef.current;
    const finalSummary = summary ? { ...summary, endedAt: Date.now() } : null;
    
    // Broadcast game end to all players
    await send({ type: 'game:end', summary: finalSummary ?? undefined });
    
    if (selfPlayer) {
      await send({ type: 'player:leave', playerId: selfPlayer.id });
    }
    await transportRef.current.disconnect();
    setStatus('ended');
    setSummary(finalSummary);
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
    currentBuzzer,
    isLoading,
    isBuzzLocked,
    isSelfLockedOut,
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
    sessionId, status, players, settings, currentQuestion, currentResult, currentBuzzer,
    isLoading, isBuzzLocked, isSelfLockedOut, summary, selfPlayer,
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
