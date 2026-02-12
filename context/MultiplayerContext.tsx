import { nanoid } from 'nanoid/non-secure';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  StateSyncPayload,
} from '@/types/multiplayer';
import { SCORING } from '@/types/multiplayer';
import type { AnswerResult, Tossup } from '@/types/qb';
import { createTransport, type MultiplayerTransport } from '@/services/multiplayer/transport';
import { fetchRandomTossup } from '@/services/qbreader';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the word index of the power mark (*) in a question.
 * QBReader marks power with (*) in the question text.
 */
function findPowerMarkWordIndex(questionText: string): number | undefined {
  const words = questionText.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (words[i].includes('(*)')) {
      return i;
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Type
// ─────────────────────────────────────────────────────────────────────────────

type MultiplayerContextValue = {
  // State
  sessionId: string | null;
  status: SessionStatus;
  players: Player[];
  allPlayers: Player[];
  settings: GameSettings | null;
  currentQuestion: Tossup | null;
  currentResult: AnswerResult | null;
  currentBuzzer: Player | null;
  isLoading: boolean;
  isBuzzLocked: boolean;
  isSelfLockedOut: boolean;
  summary: GameSummary | null;
  selfPlayer: Player | null;
  hostId: string | null;
  scores: Record<string, number>;
  isHost: boolean;
  isCoordinator: boolean;
  buzzTimerEnd: number | null;

  // Actions
  hostGame: (settings: GameSettings, playerName: string) => Promise<string>;
  joinGame: (sessionId: string, playerName: string) => Promise<void>;
  startNextQuestion: () => Promise<void>;
  submitAnswer: (answer: string, wordIndex?: number) => Promise<void>;
  pauseGame: () => Promise<void>;
  updateSettings: (settings: GameSettings) => Promise<void>;
  endGame: () => Promise<void>;
  leaveGame: () => Promise<void>;
};

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function MultiplayerProvider({ children }: PropsWithChildren) {
  // Transport
  const transportRef = useRef<MultiplayerTransport>(createTransport());
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Core state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [players, setPlayers] = useState<Player[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Tossup | null>(null);
  const [currentResult, setCurrentResult] = useState<AnswerResult | null>(null);
  const [currentBuzzer, setCurrentBuzzer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBuzzLocked, setIsBuzzLocked] = useState(false);
  const [lockedOutPlayers, setLockedOutPlayers] = useState<string[]>([]);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [selfPlayer, setSelfPlayer] = useState<Player | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [powerMarkWordIndex, setPowerMarkWordIndex] = useState<number | undefined>(undefined);
  const [buzzTimerEnd, setBuzzTimerEnd] = useState<number | null>(null);
  const buzzTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived
  const isSelfLockedOut = selfPlayer ? lockedOutPlayers.includes(selfPlayer.id) : false;
  const isHostValue = Boolean(selfPlayer && hostId && selfPlayer.id === hostId);

  const coordinatorId = useMemo(() => {
    if (players.length === 0) return null;
    const sorted = [...players].sort((a, b) => a.id.localeCompare(b.id));
    return sorted[0].id;
  }, [players]);

  const isCoordinatorValue = Boolean(selfPlayer && coordinatorId === selfPlayer.id);

  // Refs for accessing current values in callbacks
  const stateRef = useRef({
    players, settings, currentQuestion, currentResult, selfPlayer,
    lockedOutPlayers, summary, hostId, scores, powerMarkWordIndex,
    status, sessionId, allPlayers,
  });
  stateRef.current = {
    players, settings, currentQuestion, currentResult, selfPlayer,
    lockedOutPlayers, summary, hostId, scores, powerMarkWordIndex,
    status, sessionId, allPlayers,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  const isCoordinatorFn = useCallback(() => {
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
    fetchAbortRef.current?.abort();
    if (buzzTimerRef.current) {
      clearTimeout(buzzTimerRef.current);
      buzzTimerRef.current = null;
    }
    setSessionId(null);
    setStatus('idle');
    setPlayers([]);
    setAllPlayers([]);
    setSettings(null);
    setCurrentQuestion(null);
    setCurrentResult(null);
    setCurrentBuzzer(null);
    setIsLoading(false);
    setIsBuzzLocked(false);
    setLockedOutPlayers([]);
    setSummary(null);
    setSelfPlayer(null);
    setHostId(null);
    setScores({});
    setPowerMarkWordIndex(undefined);
    setBuzzTimerEnd(null);
  }, []);

  const addQuestionToSummary = useCallback((tossup: Tossup, pmIndex?: number) => {
    setSummary(prev => {
      if (!prev) return prev;
      const lastQ = prev.questions[prev.questions.length - 1];
      if (lastQ?.question.id === tossup.id) return prev;
      return { ...prev, questions: [...prev.questions, { question: tossup, buzzes: [], powerMarkWordIndex: pmIndex }] };
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
      questions[lastIdx] = { ...lastQ, buzzes, winnerId: buzz.result?.directive === 'accept' ? buzz.playerId : lastQ.winnerId };
      return { ...prev, questions };
    });
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Buzz Timer (Rule 10)
  // ───────────────────────────────────────────────────────────────────────────

  const clearBuzzTimer = useCallback(() => {
    if (buzzTimerRef.current) {
      clearTimeout(buzzTimerRef.current);
      buzzTimerRef.current = null;
    }
    setBuzzTimerEnd(null);
  }, []);

  const startBuzzTimer = useCallback((playerId: string) => {
    clearBuzzTimer();
    const endTime = Date.now() + SCORING.BUZZ_TIMEOUT_SECONDS * 1000;
    setBuzzTimerEnd(endTime);

    buzzTimerRef.current = setTimeout(() => {
      setBuzzTimerEnd(null);
      if (isCoordinatorFn()) {
        void send({ type: 'buzz:timeout', playerId });
      }
    }, SCORING.BUZZ_TIMEOUT_SECONDS * 1000);
  }, [clearBuzzTimer, isCoordinatorFn, send]);

  // ───────────────────────────────────────────────────────────────────────────
  // Question/Answer Logic
  // ───────────────────────────────────────────────────────────────────────────

  const fetchAndBroadcastQuestion = useCallback(async () => {
    const { settings } = stateRef.current;
    if (!settings) return;

    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setIsLoading(true);
    setCurrentResult(null);
    setIsBuzzLocked(false);
    setLockedOutPlayers([]);
    clearBuzzTimer();

    try {
      const tossup = await fetchRandomTossup(controller.signal, {
        difficulties: settings.difficulties,
        categories: settings.categories,
      });

      // Rule 7: Detect power mark position
      const pmIndex = findPowerMarkWordIndex(tossup.question);
      setPowerMarkWordIndex(pmIndex);

      setCurrentQuestion(tossup);
      addQuestionToSummary(tossup, pmIndex);
      setStatus('playing');
      await send({ type: 'question:new', tossup, powerMarkWordIndex: pmIndex });
    } catch (err) {
      console.error('Failed to fetch question:', err);
    } finally {
      setIsLoading(false);
    }
  }, [send, addQuestionToSummary, clearBuzzTimer]);

  const judgeAndBroadcastResult = useCallback(async (buzz: Buzz) => {
    const { currentQuestion, currentResult, lockedOutPlayers, players } = stateRef.current;
    if (!currentQuestion || currentResult) return;

    // Clear buzz timer
    clearBuzzTimer();

    // Find the buzzer player for display
    const buzzerPlayer = players.find(p => p.id === buzz.playerId) ?? null;
    setCurrentBuzzer(buzzerPlayer);
    setIsBuzzLocked(true);
    await send({ type: 'buzz:lock', playerId: buzz.playerId });

    const result = checkAnswer(
      currentQuestion.answerHtml || currentQuestion.answer,
      buzz.answer.trim()
    ) as AnswerResult;

    const isCorrect = result.directive === 'accept';

    // Rule 7: Determine if this was a power buzz
    const currentPowerMark = stateRef.current.powerMarkWordIndex;
    const isPower = isCorrect &&
      currentPowerMark !== undefined &&
      buzz.wordIndex !== undefined &&
      buzz.wordIndex < currentPowerMark;

    const resultBuzz: Buzz = { ...buzz, result, isPower };

    // Rule 6/7: Compute points
    let points: number;
    if (isCorrect) {
      points = isPower ? SCORING.POWER : SCORING.CORRECT;
    } else {
      points = SCORING.INCORRECT;
    }

    // Update scores
    const prevScores = stateRef.current.scores;
    const updatedScores = {
      ...prevScores,
      [buzz.playerId]: (prevScores[buzz.playerId] ?? 0) + points,
    };
    setScores(updatedScores);

    addBuzzToSummary(resultBuzz);
    await send({ type: 'buzz:result', buzz: resultBuzz, scores: updatedScores });

    if (isCorrect) {
      setCurrentResult(result);
      setCurrentBuzzer(null);
    } else {
      const newLockedOut = [...lockedOutPlayers, buzz.playerId];
      setLockedOutPlayers(newLockedOut);
      setCurrentBuzzer(null);

      // Check if all *active* players are now locked out
      const activePlayers = players.filter(p => p.status !== 'left');
      const allPlayersLockedOut = activePlayers.every(p => newLockedOut.includes(p.id));

      if (allPlayersLockedOut) {
        setCurrentResult(result);
        setIsBuzzLocked(true);
        await send({ type: 'buzz:unlock', lockedOutPlayers: newLockedOut, allLockedOut: true, lastResult: result });
      } else {
        setIsBuzzLocked(false);
        setCurrentResult(null);
        await send({ type: 'buzz:unlock', lockedOutPlayers: newLockedOut });
      }
    }
  }, [send, addBuzzToSummary, clearBuzzTimer]);

  // ───────────────────────────────────────────────────────────────────────────
  // Event Handler
  // ───────────────────────────────────────────────────────────────────────────

  const handleEvent = useCallback((event: GameEvent) => {
    switch (event.type) {
      case 'player:join': {
        setPlayers(prev => prev.some(p => p.id === event.player.id) ? prev : [...prev, event.player]);

        // Rule 3: Track in allPlayers
        setAllPlayers(prev => prev.some(p => p.id === event.player.id)
          ? prev
          : [...prev, { ...event.player, status: 'active' as const }]
        );

        setSummary(prev => prev && !prev.players.some(p => p.id === event.player.id)
          ? { ...prev, players: [...prev.players, { ...event.player, status: 'active' as const }] }
          : prev
        );

        // Rule 5: Initialize score for new player
        setScores(prev => event.player.id in prev ? prev : { ...prev, [event.player.id]: 0 });

        // Rule 5: Coordinator syncs FULL state to new player
        if (isCoordinatorFn()) {
          const s = stateRef.current;
          const syncPayload: StateSyncPayload = {
            players: [...s.players, event.player],
            hostId: s.hostId ?? '',
            settings: s.settings!,
            status: s.status,
            currentQuestion: s.currentQuestion ?? undefined,
            powerMarkWordIndex: s.powerMarkWordIndex,
            scores: { ...s.scores, [event.player.id]: 0 },
            lockedOutPlayers: s.lockedOutPlayers,
            questionRecords: s.summary?.questions ?? [],
          };
          void send({ type: 'state:sync', state: syncPayload });
        }
        break;
      }

      case 'player:leave': {
        // Rule 1: Remove from active players, but DON'T end the game unless empty
        setPlayers(prev => {
          const remaining = prev.filter(p => p.id !== event.playerId);
          if (remaining.length === 0) {
            setStatus('ended');
            setSummary(s => s ? { ...s, endedAt: Date.now() } : s);
          }
          return remaining;
        });

        // Rule 3: Mark as 'left' in allPlayers and summary
        setAllPlayers(prev => prev.map(p =>
          p.id === event.playerId ? { ...p, status: 'left' as const } : p
        ));
        setSummary(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.map(p =>
              p.id === event.playerId ? { ...p, status: 'left' as const } : p
            ),
          };
        });
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
        if (event.hostId) setHostId(event.hostId);
        break;
      }

      case 'game:start': {
        setSettings(event.settings);
        setStatus('playing');
        setIsBuzzLocked(false);
        setLockedOutPlayers([]);
        setCurrentResult(null);
        setCurrentBuzzer(null);
        if (event.hostId) setHostId(event.hostId);
        break;
      }

      case 'game:pause': {
        setStatus('paused');
        setIsBuzzLocked(true);
        break;
      }

      case 'game:resume': {
        setStatus('playing');
        setIsBuzzLocked(false);
        break;
      }

      case 'game:settings': {
        // Rule 2: Apply settings from host to all players
        setSettings(event.settings);
        setSummary(prev => prev ? { ...prev, settings: event.settings } : prev);
        break;
      }

      case 'game:end': {
        setStatus('ended');
        setIsBuzzLocked(true);
        clearBuzzTimer();
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
        setLockedOutPlayers([]);
        clearBuzzTimer();
        setStatus('playing');
        setPowerMarkWordIndex(event.powerMarkWordIndex);
        addQuestionToSummary(event.tossup, event.powerMarkWordIndex);
        break;
      }

      case 'question:request': {
        if (isCoordinatorFn()) {
          void fetchAndBroadcastQuestion();
        }
        break;
      }

      case 'buzz:lock': {
        setIsBuzzLocked(true);
        const { players } = stateRef.current;
        const buzzer = players.find(p => p.id === event.playerId) ?? null;
        setCurrentBuzzer(buzzer);
        // Rule 10: Start buzz timer
        startBuzzTimer(event.playerId);
        break;
      }

      case 'buzz:unlock': {
        setLockedOutPlayers(event.lockedOutPlayers);
        setCurrentBuzzer(null);

        if (event.allLockedOut && event.lastResult) {
          setCurrentResult(event.lastResult);
          setIsBuzzLocked(true);
        } else {
          setIsBuzzLocked(false);
          setCurrentResult(null);
        }
        break;
      }

      case 'buzz:submit': {
        if (isCoordinatorFn()) {
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
        clearBuzzTimer();

        // Rule 6/7: Sync scores from coordinator
        if (event.scores) {
          setScores(event.scores);
        }

        addBuzzToSummary(event.buzz);
        break;
      }

      case 'buzz:timeout': {
        // Rule 10: Handle buzz timeout
        clearBuzzTimer();
        if (isCoordinatorFn()) {
          const timeoutBuzz: Buzz = {
            playerId: event.playerId,
            timestamp: Date.now(),
            answer: '',
            timedOut: true,
          };
          void judgeAndBroadcastResult(timeoutBuzz);
        }
        break;
      }

      case 'coordinator:change': {
        // Informational — coordinator is derived from sorted players
        break;
      }

      case 'state:sync': {
        // Rule 5: Full state sync for late joiners
        const s = event.state;
        setPlayers(s.players);
        setAllPlayers(prev => {
          const merged = [...prev];
          s.players.forEach(p => {
            if (!merged.some(m => m.id === p.id)) merged.push(p);
          });
          return merged;
        });
        setHostId(s.hostId);
        setSettings(s.settings);
        setStatus(s.status);
        if (s.currentQuestion) {
          setCurrentQuestion(s.currentQuestion);
          setPowerMarkWordIndex(s.powerMarkWordIndex);
        }
        setScores(s.scores);
        setLockedOutPlayers(s.lockedOutPlayers);
        setSummary(prev => ({
          sessionId: prev?.sessionId ?? stateRef.current.sessionId ?? '',
          players: s.players,
          hostId: s.hostId,
          settings: s.settings,
          questions: s.questionRecords,
        }));
        break;
      }
    }
  }, [isCoordinatorFn, send, addQuestionToSummary, addBuzzToSummary, fetchAndBroadcastQuestion, judgeAndBroadcastResult, clearBuzzTimer, startBuzzTimer]);

  // ───────────────────────────────────────────────────────────────────────────
  // Coordinator Transfer Detection (Rule 4)
  // ───────────────────────────────────────────────────────────────────────────

  const prevCoordinatorRef = useRef<string | null>(null);

  useEffect(() => {
    if (players.length === 0) {
      prevCoordinatorRef.current = null;
      return;
    }

    const sorted = [...players].sort((a, b) => a.id.localeCompare(b.id));
    const newCoordinator = sorted[0].id;

    if (prevCoordinatorRef.current && prevCoordinatorRef.current !== newCoordinator) {
      // Coordinator changed
      if (selfPlayer && newCoordinator === selfPlayer.id) {
        void send({ type: 'coordinator:change', newCoordinatorId: newCoordinator });

        // If mid-fetch, new coordinator should take over
        if (isLoading && status === 'playing') {
          void fetchAndBroadcastQuestion();
        }
      }
    }

    prevCoordinatorRef.current = newCoordinator;
  }, [players, selfPlayer, send, isLoading, status, fetchAndBroadcastQuestion]);

  // ───────────────────────────────────────────────────────────────────────────
  // Public Actions
  // ───────────────────────────────────────────────────────────────────────────

  const hostGame = useCallback(async (gameSettings: GameSettings, playerName: string) => {
    await transportRef.current.disconnect();
    transportRef.current = createTransport();
    resetState();

    const id = nanoid(8);
    const player: Player = { id: nanoid(6), name: playerName || 'Player', status: 'active' };

    setSessionId(id);
    setStatus('lobby');
    setSettings(gameSettings);
    setPlayers([player]);
    setAllPlayers([player]);
    setSelfPlayer(player);
    setHostId(player.id);
    setScores({ [player.id]: 0 });
    setSummary({
      sessionId: id,
      players: [player],
      hostId: player.id,
      settings: gameSettings,
      questions: [],
    });

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

    const player: Player = { id: nanoid(6), name: playerName || 'Player', status: 'active' };

    setSessionId(id);
    setStatus('lobby');
    setPlayers([player]);
    setAllPlayers([player]);
    setSelfPlayer(player);
    setScores({ [player.id]: 0 });

    await transportRef.current.joinSession(id, {
      onEvent: handleEvent,
      onError: err => console.error('Transport error:', err),
    });

    await send({ type: 'player:join', player });
  }, [handleEvent, resetState, send]);

  const startNextQuestion = useCallback(async () => {
    if (isLoading) return;

    if (isCoordinatorFn()) {
      await fetchAndBroadcastQuestion();
    } else {
      await send({ type: 'question:request' });
    }
  }, [isLoading, isCoordinatorFn, fetchAndBroadcastQuestion, send]);

  const submitAnswer = useCallback(async (answer: string, wordIndex?: number) => {
    const { selfPlayer, currentQuestion, currentResult, lockedOutPlayers } = stateRef.current;
    if (!currentQuestion || currentResult || !selfPlayer) return;
    if (lockedOutPlayers.includes(selfPlayer.id)) return;

    setIsBuzzLocked(true);
    clearBuzzTimer();

    const buzz: Buzz = {
      playerId: selfPlayer.id,
      timestamp: Date.now(),
      answer,
      wordIndex,
    };

    if (isCoordinatorFn()) {
      await judgeAndBroadcastResult(buzz);
    } else {
      await send({ type: 'buzz:lock', playerId: selfPlayer.id });
      await send({ type: 'buzz:submit', buzz });
    }
  }, [isCoordinatorFn, judgeAndBroadcastResult, send, clearBuzzTimer]);

  const pauseGame = useCallback(async () => {
    setStatus('paused');
    setIsBuzzLocked(true);
    await send({ type: 'game:pause' });
  }, [send]);

  // Rule 2: Broadcast settings to all players
  const updateSettings = useCallback(async (newSettings: GameSettings) => {
    setSettings(newSettings);
    setSummary(prev => prev ? { ...prev, settings: newSettings } : prev);
    await send({ type: 'game:settings', settings: newSettings });
  }, [send]);

  // Host-only: force end game for everyone
  const endGame = useCallback(async () => {
    const { summary } = stateRef.current;
    const finalSummary = summary ? { ...summary, endedAt: Date.now() } : null;

    await send({ type: 'game:end', summary: finalSummary ?? undefined });
    await transportRef.current.disconnect();
    setStatus('ended');
    setSummary(finalSummary);
    clearBuzzTimer();
  }, [send, clearBuzzTimer]);

  // Rule 1: Graceful leave without ending game for others
  const leaveGame = useCallback(async () => {
    const { selfPlayer } = stateRef.current;

    if (selfPlayer) {
      await send({ type: 'player:leave', playerId: selfPlayer.id });
    }
    await transportRef.current.disconnect();
    setStatus('ended');
    clearBuzzTimer();
  }, [send, clearBuzzTimer]);

  // ───────────────────────────────────────────────────────────────────────────
  // Context Value
  // ───────────────────────────────────────────────────────────────────────────

  const value = useMemo<MultiplayerContextValue>(() => ({
    sessionId,
    status,
    players,
    allPlayers,
    settings,
    currentQuestion,
    currentResult,
    currentBuzzer,
    isLoading,
    isBuzzLocked,
    isSelfLockedOut,
    summary,
    selfPlayer,
    hostId,
    scores,
    isHost: isHostValue,
    isCoordinator: isCoordinatorValue,
    buzzTimerEnd,
    hostGame,
    joinGame,
    startNextQuestion,
    submitAnswer,
    pauseGame,
    updateSettings,
    endGame,
    leaveGame,
  }), [
    sessionId, status, players, allPlayers, settings, currentQuestion, currentResult, currentBuzzer,
    isLoading, isBuzzLocked, isSelfLockedOut, summary, selfPlayer,
    hostId, scores, isHostValue, isCoordinatorValue, buzzTimerEnd,
    hostGame, joinGame, startNextQuestion, submitAnswer, pauseGame, updateSettings, endGame, leaveGame,
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
