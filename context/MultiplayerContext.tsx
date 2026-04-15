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
import { SCORING, PLAYER_COLORS } from '@/types/multiplayer';
import type { AnswerResult, Tossup } from '@/types/qb';
import { createTransport, type MultiplayerTransport } from '@/services/multiplayer/transport';
import { SupabaseTransport } from '@/services/multiplayer/supabase-transport';
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
  gameCode: string | null;
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
  revealStartTime: number | null;
  buzzerAnswer: string;
  buzzerResult: { answer: string; isCorrect: boolean } | null;
  promptText: string | null;
  pausedByName: string | null;
  readyPlayers: string[];
  connectionStatuses: Record<string, 'connected' | 'reconnecting' | 'disconnected'>;
  countdownSeconds: number | null;
  playerColors: Record<string, string>;

  // Actions
  hostGame: (settings: GameSettings, playerName: string) => Promise<string>;
  joinGame: (gameCode: string, playerName: string) => Promise<void>;
  startNextQuestion: () => Promise<void>;
  buzzIn: (wordIndex?: number) => Promise<void>;
  submitBuzzAnswer: (answer: string) => Promise<void>;
  sendBuzzTyping: (text: string) => void;
  noBuzzTimeout: () => Promise<void>;
  pauseGame: () => Promise<void>;
  resumeGame: () => Promise<void>;
  updateSettings: (settings: GameSettings) => Promise<void>;
  endGame: () => Promise<void>;
  leaveGame: () => Promise<void>;
  toggleReady: () => Promise<void>;
  kickPlayer: (playerId: string) => Promise<void>;
  transferHost: (newHostId: string) => Promise<void>;
  startGameCountdown: () => void;
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
  const [gameCode, setGameCode] = useState<string | null>(null);
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
  const [revealStartTime, setRevealStartTime] = useState<number | null>(null);
  const [buzzTimerEnd, setBuzzTimerEnd] = useState<number | null>(null);
  const buzzTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Buzz-phase state: live typing + result display
  const [buzzerAnswer, setBuzzerAnswer] = useState('');
  const [buzzWordIndex, setBuzzWordIndex] = useState<number | undefined>(undefined);
  const [buzzerResult, setBuzzerResult] = useState<{ answer: string; isCorrect: boolean } | null>(null);
  const wrongAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prompt state: tracks if a player has been prompted to give a more specific answer
  const [promptText, setPromptText] = useState<string | null>(null);
  const promptedPlayerRef = useRef<string | null>(null);

  // Pause state: tracks which player paused to change settings
  const [pausedByName, setPausedByName] = useState<string | null>(null);

  // Ready system state
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);

  // Connection status per player
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, 'connected' | 'reconnecting' | 'disconnected'>>({});

  // Countdown state
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-fetched question (coordinator-local, before broadcasting to all devices)
  const prefetchedRef = useRef<{ tossup: Tossup; pmIndex?: number; settingsKey: string } | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);

  // Preloaded question (received from coordinator, ready to reveal on all devices)
  const preloadedQuestionRef = useRef<{ tossup: Tossup; pmIndex?: number } | null>(null);

  // Derived
  const isSelfLockedOut = selfPlayer ? lockedOutPlayers.includes(selfPlayer.id) : false;
  const isHostValue = Boolean(selfPlayer && hostId && selfPlayer.id === hostId);

  const coordinatorId = useMemo(() => {
    if (players.length === 0) return null;
    const sorted = [...players].sort((a, b) => a.id.localeCompare(b.id));
    return sorted[0].id;
  }, [players]);

  const isCoordinatorValue = Boolean(selfPlayer && coordinatorId === selfPlayer.id);

  // Player colors: deterministic by join order
  const playerColors = useMemo(() => {
    const colors: Record<string, string> = {};
    allPlayers.forEach((p, i) => {
      colors[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length];
    });
    return colors;
  }, [allPlayers]);

  // Refs for accessing current values in callbacks
  const stateRef = useRef({
    players, settings, currentQuestion, currentResult, selfPlayer,
    lockedOutPlayers, summary, hostId, scores, powerMarkWordIndex,
    status, sessionId, allPlayers, buzzWordIndex, gameCode, readyPlayers,
  });
  stateRef.current = {
    players, settings, currentQuestion, currentResult, selfPlayer,
    lockedOutPlayers, summary, hostId, scores, powerMarkWordIndex,
    status, sessionId, allPlayers, buzzWordIndex, gameCode, readyPlayers,
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

  const clearWrongAnswerTimer = useCallback(() => {
    if (wrongAnswerTimerRef.current) {
      clearTimeout(wrongAnswerTimerRef.current);
      wrongAnswerTimerRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    fetchAbortRef.current?.abort();
    prefetchAbortRef.current?.abort();
    prefetchedRef.current = null;
    preloadedQuestionRef.current = null;
    if (buzzTimerRef.current) {
      clearTimeout(buzzTimerRef.current);
      buzzTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    clearWrongAnswerTimer();
    setSessionId(null);
    setGameCode(null);
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
    setRevealStartTime(null);
    setBuzzTimerEnd(null);
    setBuzzerAnswer('');
    setBuzzWordIndex(undefined);
    setBuzzerResult(null);
    setPromptText(null);
    promptedPlayerRef.current = null;
    setPausedByName(null);
    setReadyPlayers([]);
    setConnectionStatuses({});
    setCountdownSeconds(null);
  }, [clearWrongAnswerTimer]);

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
  // Question Pre-fetch & Pre-distribute
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Coordinator: fetch a question and broadcast it to ALL devices as a preload.
   * Called during the answer phase so by the time "Next" is tapped, every device
   * already has the data — zero perceived latency on reveal.
   */
  const prefetchAndDistribute = useCallback(() => {
    const { settings } = stateRef.current;
    if (!settings) return;

    prefetchAbortRef.current?.abort();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;

    fetchRandomTossup(controller.signal, {
      difficulties: settings.difficulties,
      categories: settings.categories,
    }).then(tossup => {
      if (controller.signal.aborted) return;
      const pmIndex = findPowerMarkWordIndex(tossup.question);

      // Store locally
      prefetchedRef.current = {
        tossup,
        pmIndex,
        settingsKey: `${settings.difficulties.join(',')}_${settings.categories.join(',')}`,
      };
      preloadedQuestionRef.current = { tossup, pmIndex };

      // Broadcast to all other devices so they have it ready
      void send({ type: 'question:preload', tossup, powerMarkWordIndex: pmIndex });
    }).catch(() => {});
  }, [send]);

  // ───────────────────────────────────────────────────────────────────────────
  // Question/Answer Logic
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Activate the preloaded question on the coordinator's device and send
   * a lightweight "reveal" signal so all other devices start simultaneously.
   */
  const revealPreloadedQuestion = useCallback(() => {
    const preloaded = preloadedQuestionRef.current;
    if (!preloaded) return false;

    preloadedQuestionRef.current = null;
    prefetchedRef.current = null;

    setCurrentResult(null);
    setIsBuzzLocked(false);
    setLockedOutPlayers([]);
    setBuzzerAnswer('');
    setBuzzerResult(null);
    setBuzzWordIndex(undefined);
    setPromptText(null);
    promptedPlayerRef.current = null;
    clearBuzzTimer();
    clearWrongAnswerTimer();

    const revealStart = Date.now();
    setPowerMarkWordIndex(preloaded.pmIndex);
    setRevealStartTime(revealStart);
    setCurrentQuestion(preloaded.tossup);
    addQuestionToSummary(preloaded.tossup, preloaded.pmIndex);
    void send({ type: 'question:reveal', revealStartTime: revealStart });
    setIsLoading(false);
    setStatus('playing');

    // Start pre-fetching the NEXT question for all devices
    prefetchAndDistribute();
    return true;
  }, [send, addQuestionToSummary, clearBuzzTimer, clearWrongAnswerTimer, prefetchAndDistribute]);

  /**
   * Fallback: fetch a question on-demand and broadcast with question:new.
   * Used when no preloaded question is available (first question, settings changed).
   */
  const fetchAndBroadcastQuestion = useCallback(async () => {
    const { settings } = stateRef.current;
    if (!settings) return;

    // Try the preloaded path first (zero latency)
    if (revealPreloadedQuestion()) return;

    // Fallback: fetch now
    fetchAbortRef.current?.abort();
    prefetchAbortRef.current?.abort();

    setIsLoading(true);
    setCurrentResult(null);
    setIsBuzzLocked(false);
    setLockedOutPlayers([]);
    setBuzzerAnswer('');
    setBuzzerResult(null);
    setBuzzWordIndex(undefined);
    setPromptText(null);
    promptedPlayerRef.current = null;
    clearBuzzTimer();
    clearWrongAnswerTimer();

    let tossup: Tossup;
    let pmIndex: number | undefined;

    try {
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      tossup = await fetchRandomTossup(controller.signal, {
        difficulties: settings.difficulties,
        categories: settings.categories,
      });
      pmIndex = findPowerMarkWordIndex(tossup.question);
    } catch (err) {
      console.error('Failed to fetch question:', err);
      setIsLoading(false);
      setStatus('playing');
      return;
    }

    const revealStart = Date.now();
    setPowerMarkWordIndex(pmIndex);
    setRevealStartTime(revealStart);
    setCurrentQuestion(tossup);
    addQuestionToSummary(tossup, pmIndex);
    void send({ type: 'question:new', tossup, powerMarkWordIndex: pmIndex, revealStartTime: revealStart });
    setIsLoading(false);
    setStatus('playing');

    // Pre-fetch + distribute next question to all devices
    prefetchAndDistribute();
  }, [send, addQuestionToSummary, clearBuzzTimer, clearWrongAnswerTimer, prefetchAndDistribute, revealPreloadedQuestion]);

  const judgeAndBroadcastResult = useCallback(async (buzz: Buzz) => {
    const { currentQuestion, currentResult, lockedOutPlayers, players } = stateRef.current;
    if (!currentQuestion || currentResult) return;

    // Clear buzz timer
    clearBuzzTimer();

    let result = checkAnswer(
      currentQuestion.answerHtml || currentQuestion.answer,
      buzz.answer.trim()
    ) as AnswerResult;

    // Handle prompts: give the player one more chance to be more specific
    const isPrompted = promptedPlayerRef.current === buzz.playerId;
    if (result.directive === 'prompt' && !isPrompted) {
      promptedPlayerRef.current = buzz.playerId;
      setPromptText(result.directedPrompt ?? 'Be more specific');
      setBuzzerAnswer('');
      void send({ type: 'buzz:prompt', playerId: buzz.playerId, directedPrompt: result.directedPrompt });
      startBuzzTimer(buzz.playerId);
      return;
    }

    // Second prompt → treat as reject
    if (result.directive === 'prompt') {
      result = { ...result, directive: 'reject' };
    }

    // Clear prompt state
    promptedPlayerRef.current = null;
    setPromptText(null);

    const isCorrect = result.directive === 'accept';

    // Rule 7: Determine if this was a power buzz
    const currentPowerMark = stateRef.current.powerMarkWordIndex;
    const isPower = isCorrect &&
      currentPowerMark !== undefined &&
      buzz.wordIndex !== undefined &&
      buzz.wordIndex <= currentPowerMark;

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

    // Broadcast result immediately (fire-and-forget) so other players see it ASAP
    void send({ type: 'buzz:result', buzz: resultBuzz, scores: updatedScores });

    // Update coordinator's local state without waiting for network
    if (isCorrect) {
      setCurrentResult(result);
      setCurrentBuzzer(null);
      setBuzzerAnswer('');
      setBuzzerResult(null);
    } else {
      const newLockedOut = [...lockedOutPlayers, buzz.playerId];
      setLockedOutPlayers(newLockedOut);

      // Show wrong answer to all players
      setBuzzerResult({ answer: resultBuzz.answer, isCorrect: false });
      setBuzzerAnswer(resultBuzz.answer);

      // Check if all *active* players are now locked out
      const activePlayers = players.filter(p => p.status !== 'left');
      const allPlayersLockedOut = activePlayers.every(p => newLockedOut.includes(p.id));

      if (allPlayersLockedOut) {
        // No delay — show final result immediately
        setCurrentResult(result);
        setIsBuzzLocked(true);
        setCurrentBuzzer(null);
        setBuzzerResult(null);
        setBuzzerAnswer('');
        void send({ type: 'buzz:unlock', lockedOutPlayers: newLockedOut, allLockedOut: true, lastResult: result });
      } else {
        // Delay unlock so everyone sees the wrong answer briefly
        clearWrongAnswerTimer();
        wrongAnswerTimerRef.current = setTimeout(() => {
          setCurrentBuzzer(null);
          setBuzzerResult(null);
          setBuzzerAnswer('');
          setIsBuzzLocked(false);
          setCurrentResult(null);
          void send({ type: 'buzz:unlock', lockedOutPlayers: newLockedOut });
        }, SCORING.WRONG_ANSWER_DISPLAY_MS);
      }
    }
  }, [send, addBuzzToSummary, clearBuzzTimer, clearWrongAnswerTimer, startBuzzTimer]);

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

        // Mark new player as connected
        setConnectionStatuses(prev => ({ ...prev, [event.player.id]: 'connected' }));

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
            gameCode: s.gameCode ?? undefined,
            readyPlayers: s.readyPlayers,
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

        // Remove from ready list
        setReadyPlayers(prev => prev.filter(id => id !== event.playerId));
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

      case 'player:ready': {
        setReadyPlayers(prev => {
          if (event.ready) {
            return prev.includes(event.playerId) ? prev : [...prev, event.playerId];
          }
          return prev.filter(id => id !== event.playerId);
        });
        break;
      }

      case 'player:kick': {
        const { selfPlayer } = stateRef.current;
        if (selfPlayer && event.playerId === selfPlayer.id) {
          // We got kicked — disconnect and reset
          void transportRef.current.disconnect();
          resetState();
          return;
        }
        setPlayers(prev => prev.filter(p => p.id !== event.playerId));
        setAllPlayers(prev => prev.map(p =>
          p.id === event.playerId ? { ...p, status: 'left' as const } : p
        ));
        setReadyPlayers(prev => prev.filter(id => id !== event.playerId));
        break;
      }

      case 'player:connection_status': {
        setConnectionStatuses(prev => ({
          ...prev,
          [event.playerId]: event.status,
        }));
        break;
      }

      case 'host:transfer': {
        setHostId(event.newHostId);
        break;
      }

      case 'game:countdown': {
        setCountdownSeconds(event.seconds);
        break;
      }

      case 'game:start': {
        setSettings(event.settings);
        setStatus('playing');
        setIsBuzzLocked(false);
        setLockedOutPlayers([]);
        setCurrentResult(null);
        setCurrentBuzzer(null);
        setCountdownSeconds(null);
        if (event.hostId) setHostId(event.hostId);
        break;
      }

      case 'game:pause': {
        setStatus('paused');
        setIsBuzzLocked(true);
        setPausedByName(event.playerName ?? null);
        break;
      }

      case 'game:resume': {
        setStatus('playing');
        setIsBuzzLocked(false);
        setPausedByName(null);
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
        // Fallback path: question data arrives with the reveal signal
        setCurrentQuestion(event.tossup);
        setCurrentResult(null);
        setCurrentBuzzer(null);
        setIsBuzzLocked(false);
        setLockedOutPlayers([]);
        clearBuzzTimer();
        clearWrongAnswerTimer();
        setStatus('playing');
        setPowerMarkWordIndex(event.powerMarkWordIndex);
        setRevealStartTime(event.revealStartTime ?? Date.now());
        setBuzzerAnswer('');
        setBuzzerResult(null);
        setBuzzWordIndex(undefined);
        setPromptText(null);
        promptedPlayerRef.current = null;
        addQuestionToSummary(event.tossup, event.powerMarkWordIndex);
        break;
      }

      case 'question:preload': {
        // Coordinator sent the next question early — store it for instant reveal
        preloadedQuestionRef.current = {
          tossup: event.tossup,
          pmIndex: event.powerMarkWordIndex,
        };
        break;
      }

      case 'question:reveal': {
        // "Go" signal — activate the preloaded question
        const preloaded = preloadedQuestionRef.current;
        if (preloaded) {
          preloadedQuestionRef.current = null;
          setCurrentQuestion(preloaded.tossup);
          setCurrentResult(null);
          setCurrentBuzzer(null);
          setIsBuzzLocked(false);
          setLockedOutPlayers([]);
          clearBuzzTimer();
          clearWrongAnswerTimer();
          setStatus('playing');
          setPowerMarkWordIndex(preloaded.pmIndex);
          setRevealStartTime(event.revealStartTime);
          setBuzzerAnswer('');
          setBuzzerResult(null);
          setBuzzWordIndex(undefined);
          setPromptText(null);
          promptedPlayerRef.current = null;
          addQuestionToSummary(preloaded.tossup, preloaded.pmIndex);
        }
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
        setBuzzerAnswer('');
        setBuzzerResult(null);
        const { players } = stateRef.current;
        const buzzer = players.find(p => p.id === event.playerId) ?? null;
        setCurrentBuzzer(buzzer);
        // Rule 10: Start buzz timer
        startBuzzTimer(event.playerId);
        break;
      }

      case 'buzz:typing': {
        setBuzzerAnswer(event.text);
        break;
      }

      case 'buzz:prompt': {
        // Player was prompted — give them another chance to answer
        setPromptText(event.directedPrompt ?? 'Be more specific');
        setBuzzerAnswer('');
        startBuzzTimer(event.playerId);
        break;
      }

      case 'buzz:unlock': {
        setLockedOutPlayers(event.lockedOutPlayers);
        setCurrentBuzzer(null);
        setBuzzerResult(null);
        setBuzzerAnswer('');

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
        clearBuzzTimer();
        setPromptText(null);

        if (isCorrect) {
          setCurrentResult(event.buzz.result ?? null);
          setIsBuzzLocked(true);
          setCurrentBuzzer(null);
          setBuzzerAnswer('');
          setBuzzerResult(null);
        } else {
          // Show wrong answer — buzz:unlock (arriving after the delay) will clear it
          setBuzzerResult({ answer: event.buzz.answer, isCorrect: false });
          setBuzzerAnswer(event.buzz.answer);

          // Immediately mark the buzzer as locked out so the question
          // reveal continues for them while others can still play.
          const { selfPlayer } = stateRef.current;
          if (selfPlayer && event.buzz.playerId === selfPlayer.id) {
            setLockedOutPlayers(prev =>
              prev.includes(event.buzz.playerId) ? prev : [...prev, event.buzz.playerId]
            );
          }
        }

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

      case 'question:timeup': {
        // No one buzzed — show answer, no points
        if (!stateRef.current.currentResult) {
          setCurrentResult({ directive: 'reject' } as AnswerResult);
          setIsBuzzLocked(true);
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
        if (s.gameCode) setGameCode(s.gameCode);
        if (s.readyPlayers) setReadyPlayers(s.readyPlayers);
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
  }, [isCoordinatorFn, send, addQuestionToSummary, addBuzzToSummary, fetchAndBroadcastQuestion, judgeAndBroadcastResult, clearBuzzTimer, clearWrongAnswerTimer, startBuzzTimer, resetState]);

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
  // Server Event Callbacks (WebSocket transport specific)
  // ───────────────────────────────────────────────────────────────────────────

  const setupServerCallbacks = useCallback((transport: MultiplayerTransport) => {
    if (!(transport instanceof SupabaseTransport)) return;

    transport.setServerCallbacks({
      onRoomCreated: (code) => {
        setGameCode(code);
      },
      onRoomJoined: (code, serverPlayers) => {
        setGameCode(code);
        // Server player list is informational — game-level player:join events handle state
      },
      onPlayerJoined: (_playerId, _playerName) => {
        // Handled by game-level player:join event
      },
      onPlayerLeft: (playerId, reason) => {
        if (reason === 'disconnected') {
          setConnectionStatuses(prev => ({ ...prev, [playerId]: 'disconnected' }));
        } else {
          // Player left or was kicked — remove immediately.
          // This is the authoritative signal from the server; the game-level
          // relay event may not arrive if the WS closed before it was flushed.
          setPlayers(prev => prev.filter(p => p.id !== playerId));
          setAllPlayers(prev => prev.map(p =>
            p.id === playerId ? { ...p, status: 'left' as const } : p
          ));
          setReadyPlayers(prev => prev.filter(id => id !== playerId));
          setSummary(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              players: prev.players.map(p =>
                p.id === playerId ? { ...p, status: 'left' as const } : p
              ),
            };
          });
        }
      },
      onPlayerReconnected: (playerId) => {
        setConnectionStatuses(prev => ({ ...prev, [playerId]: 'connected' }));
      },
      onHostTransferred: (newHostId) => {
        setHostId(newHostId);
      },
      onConnectionStatusChange: (connectionStatus) => {
        const { selfPlayer } = stateRef.current;
        if (selfPlayer) {
          setConnectionStatuses(prev => ({ ...prev, [selfPlayer.id]: connectionStatus }));
        }
      },
      onRoomTimeout: () => {
        setStatus('ended');
      },
      onRoomError: (message) => {
        console.error('Room error:', message);
      },
      onRoomFull: () => {
        console.warn('Room is full');
      },
      onRoomNotFound: () => {
        console.warn('Room not found');
      },
    });
  }, []);

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
    setConnectionStatuses({ [player.id]: 'connected' });
    setReadyPlayers([player.id]); // Host is auto-ready
    setSummary({
      sessionId: id,
      players: [player],
      hostId: player.id,
      settings: gameSettings,
      questions: [],
    });

    // Set player info on transport (needed for reconnection)
    if (transportRef.current instanceof SupabaseTransport) {
      transportRef.current.setPlayerInfo(player.id, player.name);
    }

    setupServerCallbacks(transportRef.current);

    await transportRef.current.startHosting(player.id, player.name, {
      onEvent: handleEvent,
      onError: err => console.error('Transport error:', err),
    });

    void send({ type: 'player:join', player });

    // For WebSocket transport, the game code is set asynchronously via onRoomCreated.
    // Return the sessionId for navigation — the lobby will display the game code once available.
    return id;
  }, [handleEvent, resetState, send, setupServerCallbacks]);

  const joinGame = useCallback(async (code: string, playerName: string) => {
    await transportRef.current.disconnect();
    transportRef.current = createTransport();
    resetState();

    const player: Player = { id: nanoid(6), name: playerName || 'Player', status: 'active' };

    setSessionId(code);
    setGameCode(code.toUpperCase());
    setStatus('lobby');
    setPlayers([player]);
    setAllPlayers([player]);
    setSelfPlayer(player);
    setScores({ [player.id]: 0 });
    setConnectionStatuses({ [player.id]: 'connected' });

    // Set player info on transport (needed for reconnection)
    if (transportRef.current instanceof SupabaseTransport) {
      transportRef.current.setPlayerInfo(player.id, player.name);
    }

    setupServerCallbacks(transportRef.current);

    await transportRef.current.joinSession(code, {
      onEvent: handleEvent,
      onError: err => console.error('Transport error:', err),
    });

    void send({ type: 'player:join', player });
  }, [handleEvent, resetState, send, setupServerCallbacks]);

  const startNextQuestion = useCallback(async () => {
    if (isLoading) return;

    if (isCoordinatorFn()) {
      await fetchAndBroadcastQuestion();
    } else {
      void send({ type: 'question:request' });
    }
  }, [isLoading, isCoordinatorFn, fetchAndBroadcastQuestion, send]);

  /** Called when a player taps the buzz button — locks buzz for everyone. */
  const buzzIn = useCallback(async (wordIndex?: number) => {
    const { selfPlayer, currentQuestion, currentResult, lockedOutPlayers } = stateRef.current;
    if (!currentQuestion || currentResult || !selfPlayer) return;
    if (lockedOutPlayers.includes(selfPlayer.id)) return;

    setIsBuzzLocked(true);
    setBuzzWordIndex(wordIndex);
    setCurrentBuzzer(selfPlayer);
    setBuzzerAnswer('');
    setBuzzerResult(null);

    // Coordinator needs to enforce the timer locally (won't receive own events back)
    if (isCoordinatorFn()) {
      startBuzzTimer(selfPlayer.id);
    }

    void send({ type: 'buzz:lock', playerId: selfPlayer.id });
  }, [isCoordinatorFn, startBuzzTimer, send]);

  /** Called when a player submits their answer (or auto-submits on timer expiry). */
  const submitBuzzAnswer = useCallback(async (answer: string) => {
    const { selfPlayer, currentQuestion, currentResult, buzzWordIndex: wordIdx } = stateRef.current;
    if (!currentQuestion || currentResult || !selfPlayer) return;

    clearBuzzTimer();

    const buzz: Buzz = {
      playerId: selfPlayer.id,
      timestamp: Date.now(),
      answer,
      wordIndex: wordIdx,
    };

    if (isCoordinatorFn()) {
      void judgeAndBroadcastResult(buzz);
    } else {
      void send({ type: 'buzz:submit', buzz });
    }
  }, [isCoordinatorFn, judgeAndBroadcastResult, send, clearBuzzTimer]);

  /** Broadcast current typing to other players. */
  const sendBuzzTyping = useCallback((text: string) => {
    const { selfPlayer } = stateRef.current;
    if (!selfPlayer) return;
    void send({ type: 'buzz:typing', playerId: selfPlayer.id, text });
  }, [send]);

  /** No one buzzed and the timer expired — show answer, no points. */
  const noBuzzTimeout = useCallback(async () => {
    const { currentResult, currentQuestion } = stateRef.current;
    if (currentResult || !currentQuestion) return;

    // Show answer locally for all players
    setCurrentResult({ directive: 'reject' } as AnswerResult);
    setIsBuzzLocked(true);

    // Coordinator broadcasts to ensure consistency
    if (isCoordinatorFn()) {
      void send({ type: 'question:timeup' });
    }
  }, [isCoordinatorFn, send]);

  const pauseGame = useCallback(async () => {
    const name = stateRef.current.selfPlayer?.name;
    setStatus('paused');
    setIsBuzzLocked(true);
    setPausedByName(name ?? null);
    void send({ type: 'game:pause', playerName: name });
  }, [send]);

  const resumeGame = useCallback(async () => {
    setStatus('playing');
    setIsBuzzLocked(false);
    setPausedByName(null);
    void send({ type: 'game:resume' });
  }, [send]);

  // Rule 2: Broadcast settings to all players
  const updateSettings = useCallback(async (newSettings: GameSettings) => {
    setSettings(newSettings);
    setSummary(prev => prev ? { ...prev, settings: newSettings } : prev);
    // Invalidate prefetch + preload since settings changed
    prefetchedRef.current = null;
    preloadedQuestionRef.current = null;
    prefetchAbortRef.current?.abort();
    void send({ type: 'game:settings', settings: newSettings });
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
  // New Actions: Ready, Kick, Host Transfer, Countdown
  // ───────────────────────────────────────────────────────────────────────────

  const toggleReady = useCallback(async () => {
    const { selfPlayer, readyPlayers: currentReady } = stateRef.current;
    if (!selfPlayer) return;

    const isCurrentlyReady = currentReady.includes(selfPlayer.id);
    const newReady = !isCurrentlyReady;

    setReadyPlayers(prev => {
      if (newReady) return prev.includes(selfPlayer.id) ? prev : [...prev, selfPlayer.id];
      return prev.filter(id => id !== selfPlayer.id);
    });

    void send({ type: 'player:ready', playerId: selfPlayer.id, ready: newReady });
  }, [send]);

  const kickPlayer = useCallback(async (playerId: string) => {
    if (!isHostValue) return;
    void send({ type: 'player:kick', playerId });

    // Also tell the server to kick (for WebSocket transport)
    if (transportRef.current instanceof SupabaseTransport) {
      transportRef.current.kickPlayer(playerId);
    }
  }, [isHostValue, send]);

  const transferHost = useCallback(async (newHostId: string) => {
    if (!isHostValue) return;
    setHostId(newHostId);
    void send({ type: 'host:transfer', newHostId });

    // Also tell the server
    if (transportRef.current instanceof SupabaseTransport) {
      transportRef.current.transferHost(newHostId);
    }
  }, [isHostValue, send]);

  const startGameCountdown = useCallback(() => {
    if (!isHostValue) return;
    const { settings, hostId: currentHostId } = stateRef.current;
    if (!settings || !currentHostId) return;

    // Start 3-second countdown
    let remaining = 3;
    setCountdownSeconds(remaining);
    void send({ type: 'game:countdown', seconds: remaining });

    countdownTimerRef.current = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        setCountdownSeconds(remaining);
        void send({ type: 'game:countdown', seconds: remaining });
      } else {
        // Countdown finished — start the game
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownSeconds(null);
        setReadyPlayers([]);

        const s = stateRef.current;
        void send({ type: 'game:start', settings: s.settings!, hostId: s.hostId! });

        // Trigger locally too
        setStatus('playing');
        setIsBuzzLocked(false);
        setLockedOutPlayers([]);
        setCurrentResult(null);
        setCurrentBuzzer(null);

        // Initialize summary for the new game
        setSummary({
          sessionId: s.sessionId ?? '',
          players: s.players,
          hostId: s.hostId ?? '',
          settings: s.settings!,
          questions: [],
        });
      }
    }, 1000);
  }, [isHostValue, send]);

  // ───────────────────────────────────────────────────────────────────────────
  // Context Value
  // ───────────────────────────────────────────────────────────────────────────

  const value = useMemo<MultiplayerContextValue>(() => ({
    sessionId,
    gameCode,
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
    revealStartTime,
    buzzerAnswer,
    buzzerResult,
    promptText,
    pausedByName,
    readyPlayers,
    connectionStatuses,
    countdownSeconds,
    playerColors,
    hostGame,
    joinGame,
    startNextQuestion,
    buzzIn,
    submitBuzzAnswer,
    sendBuzzTyping,
    noBuzzTimeout,
    pauseGame,
    resumeGame,
    updateSettings,
    endGame,
    leaveGame,
    toggleReady,
    kickPlayer,
    transferHost,
    startGameCountdown,
  }), [
    sessionId, gameCode, status, players, allPlayers, settings, currentQuestion, currentResult, currentBuzzer,
    isLoading, isBuzzLocked, isSelfLockedOut, summary, selfPlayer,
    hostId, scores, isHostValue, isCoordinatorValue, buzzTimerEnd, revealStartTime,
    buzzerAnswer, buzzerResult, promptText, pausedByName,
    readyPlayers, connectionStatuses, countdownSeconds, playerColors,
    hostGame, joinGame, startNextQuestion, buzzIn, submitBuzzAnswer, sendBuzzTyping, noBuzzTimeout,
    pauseGame, resumeGame, updateSettings, endGame, leaveGame,
    toggleReady, kickPlayer, transferHost, startGameCountdown,
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
