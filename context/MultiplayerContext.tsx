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
  ConnectionStatus,
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
import {
  getQuestionWordCount,
  getRevealIntervalMs,
  getRevealStartTimeForWordIndex,
  getVisibleWordCountForTime,
} from '@/utils/revealTiming';
import { getCoordinatorPlayerId } from '@/utils/multiplayerPlayers';
import { buildActivePlayerRemovalUpdate } from '@/utils/multiplayerRemoval';
import { resolvePromptDisplayText } from '@/utils/quizSession';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

const GAME_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateLocalGameCode(): string {
  let code = '';
  for (let index = 0; index < 6; index++) {
    code += GAME_CODE_CHARS[Math.floor(Math.random() * GAME_CODE_CHARS.length)];
  }
  return code;
}

/**
 * Find the word index of the power mark (*) in a question.
 * QBReader marks power with (*) in the question text.
 */
function findPowerMarkWordIndex(questionText: string): number | undefined {
  const words = questionText.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (words[i].includes('*')) {
      return i;
    }
  }
  return undefined;
}

function buildSettingsKey(settings: GameSettings): string {
  return `${[...settings.difficulties].sort((a, b) => a - b).join(',')}_${[...settings.categories].sort().join(',')}_${settings.revealSpeed}`;
}

function uniquePlayersById(players: Player[]): Player[] {
  const order: string[] = [];
  const byId = new Map<string, Player>();

  for (const player of players) {
    if (!byId.has(player.id)) {
      order.push(player.id);
    }
    byId.set(player.id, { ...byId.get(player.id), ...player });
  }

  return order.map(id => byId.get(id)!);
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Type
// ─────────────────────────────────────────────────────────────────────────────

type MultiplayerContextValue = {
  // State
  sessionId: string | null;
  gameCode: string | null;
  status: SessionStatus;
  forcedExitReason: 'kicked' | null;
  players: Player[];
  allPlayers: Player[];
  settings: GameSettings | null;
  pendingSettings: GameSettings | null;
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
  buzzQueuePosition: number | null;
  pausedByPlayerId: string | null;
  pausedByName: string | null;
  reviewSecondsRemaining: number | null;
  reviewPausedByPlayerId: string | null;
  reviewPausedByName: string | null;
  readyPlayers: string[];
  connectionStatuses: Record<string, ConnectionStatus>;
  countdownSeconds: number | null;
  playerColors: Record<string, string>;

  // Actions
  hostGame: (settings: GameSettings, playerName: string) => Promise<string>;
  joinGame: (gameCode: string, playerName: string) => Promise<SessionStatus>;
  startNextQuestion: () => Promise<void>;
  buzzIn: (wordIndex?: number) => Promise<void>;
  submitBuzzAnswer: (answer: string) => Promise<void>;
  sendBuzzTyping: (text: string) => void;
  syncRevealWordIndex: (wordIndex: number) => void;
  noBuzzTimeout: (questionId?: string) => Promise<void>;
  pauseGame: () => Promise<void>;
  resumeGame: () => Promise<void>;
  pauseReview: () => Promise<void>;
  resumeReview: () => Promise<void>;
  updateSettings: (settings: GameSettings, options?: { deferUntilNextQuestion?: boolean; lobbyOnly?: boolean }) => Promise<void>;
  endGame: () => Promise<void>;
  leaveGame: () => Promise<void>;
  toggleReady: () => Promise<void>;
  kickPlayer: (playerId: string) => Promise<void>;
  transferHost: (newHostId: string) => Promise<void>;
  startGameCountdown: () => void;
  acknowledgeForcedExit: () => void;
  completeForcedExit: () => void;
};

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);
const TYPING_THROTTLE_MS = 120;
const CLOCK_SYNC_INTERVAL_MS = 4000;
const CLOCK_SYNC_MAX_RTT_MS = 1500;
const CLOCK_SYNC_SMOOTHING = 0.25;
const REVEAL_START_LEAD_MS = 250;
const JOIN_SYNC_WAIT_MS = 2500;
const REVIEW_COUNTDOWN_MS = SCORING.REVIEW_SECONDS * 1000;

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
  const [forcedExitReason, setForcedExitReason] = useState<'kicked' | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [pendingSettings, setPendingSettings] = useState<GameSettings | null>(null);
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
  const [buzzQueue, setBuzzQueue] = useState<string[]>([]);
  const buzzQueueRef = useRef<string[]>([]);
  const activeBuzzerIdRef = useRef<string | null>(null);
  const queuedBuzzWordIndexRef = useRef<Record<string, number | undefined>>({});
  const wrongAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Optimistic-buzz tracking: true between local buzz tap and authoritative
  // confirmation (buzz:lock / buzz:queue / buzz:unlock) from the coordinator.
  const selfBuzzPendingRef = useRef(false);
  // Throttle state for outbound buzz:typing broadcasts.
  const lastTypingSendRef = useRef(0);
  const pendingTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTypingTextRef = useRef('');
  const clockSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coordinatorClockOffsetRef = useRef(0);
  const bestClockSyncRttRef = useRef<number | null>(null);
  const revealPausedAtRef = useRef<number | null>(null);
  const revealPausedWordIndexRef = useRef<number | null>(null);
  const currentRevealWordIndexRef = useRef<number | null>(null);

  // Prompt state: tracks if a player has been prompted to give a more specific answer
  const [promptText, setPromptText] = useState<string | null>(null);
  const promptedPlayerRef = useRef<string | null>(null);

  // Pause state: tracks which player paused to change settings
  const [pausedByName, setPausedByName] = useState<string | null>(null);
  const [pausedByPlayerId, setPausedByPlayerId] = useState<string | null>(null);
  const [reviewSecondsRemaining, setReviewSecondsRemaining] = useState<number | null>(null);
  const [reviewPausedByPlayerId, setReviewPausedByPlayerId] = useState<string | null>(null);
  const [reviewPausedByName, setReviewPausedByName] = useState<string | null>(null);
  const reviewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reviewNextQuestionAtRef = useRef<number | null>(null);
  const reviewRemainingMsRef = useRef<number | null>(null);

  // Ready system state
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);

  // Connection status per player
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({});

  // Countdown state
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-fetched question (coordinator-local, before broadcasting to all devices)
  const prefetchedRef = useRef<{ tossup: Tossup; pmIndex?: number; settingsKey: string } | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchInFlightKeyRef = useRef<string | null>(null);
  const prefetchInFlightPromiseRef = useRef<Promise<void> | null>(null);
  const isLeavingSessionRef = useRef(false);
  const joinSyncResolverRef = useRef<{
    playerId: string;
    resolve: (status: SessionStatus) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Preloaded question (received from coordinator, ready to reveal on all devices)
  const preloadedQuestionRef = useRef<{ tossup: Tossup; pmIndex?: number; settingsKey?: string } | null>(null);

  // Derived
  const isSelfLockedOut = selfPlayer ? lockedOutPlayers.includes(selfPlayer.id) : false;
  const isHostValue = Boolean(selfPlayer && hostId && selfPlayer.id === hostId);
  const buzzQueuePosition = selfPlayer
    ? buzzQueue.findIndex(playerId => playerId === selfPlayer.id) + 1 || null
    : null;

  const coordinatorId = useMemo(
    () => getCoordinatorPlayerId(players, connectionStatuses),
    [connectionStatuses, players],
  );

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
    players, settings, pendingSettings, currentQuestion, currentResult, currentBuzzer, selfPlayer,
    lockedOutPlayers, summary, hostId, scores, powerMarkWordIndex,
    status, sessionId, allPlayers, buzzWordIndex, gameCode, readyPlayers, revealStartTime,
    isBuzzLocked, buzzQueue, buzzTimerEnd, buzzerAnswer, buzzerResult, promptText,
    reviewSecondsRemaining, reviewPausedByPlayerId, reviewPausedByName, isLoading,
    connectionStatuses,
  });
  stateRef.current = {
    players, settings, pendingSettings, currentQuestion, currentResult, currentBuzzer, selfPlayer,
    lockedOutPlayers, summary, hostId, scores, powerMarkWordIndex,
    status, sessionId, allPlayers, buzzWordIndex, gameCode, readyPlayers, revealStartTime,
    isBuzzLocked, buzzQueue, buzzTimerEnd, buzzerAnswer, buzzerResult, promptText,
    reviewSecondsRemaining, reviewPausedByPlayerId, reviewPausedByName, isLoading,
    connectionStatuses,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  const isCoordinatorFn = useCallback(() => {
    const { players, selfPlayer, connectionStatuses } = stateRef.current;
    if (!selfPlayer) return false;
    return getCoordinatorPlayerId(players, connectionStatuses) === selfPlayer.id;
  }, []);

  const getCoordinatorNow = useCallback(() => Date.now() + coordinatorClockOffsetRef.current, []);

  const coordinatorTimeToLocal = useCallback((coordinatorTime: number) => (
    coordinatorTime - coordinatorClockOffsetRef.current
  ), []);

  const localTimeToCoordinator = useCallback((localTime: number) => (
    localTime + coordinatorClockOffsetRef.current
  ), []);

  const getNextRevealStartTime = useCallback(() => (
    getCoordinatorNow() + REVEAL_START_LEAD_MS
  ), [getCoordinatorNow]);

  const send = useCallback(async (event: GameEvent) => {
    try {
      await transportRef.current.send(event);
    } catch (err) {
      console.error('Failed to send event:', err);
    }
  }, []);

  useEffect(() => {
    if (clockSyncIntervalRef.current) {
      clearInterval(clockSyncIntervalRef.current);
      clockSyncIntervalRef.current = null;
    }
    bestClockSyncRttRef.current = null;

    if (!selfPlayer || status === 'idle' || status === 'ended') {
      coordinatorClockOffsetRef.current = 0;
      return;
    }

    if (isCoordinatorValue) {
      coordinatorClockOffsetRef.current = 0;
      return;
    }

    const sendClockPing = () => {
      void send({ type: 'clock:ping', playerId: selfPlayer.id, sentAt: Date.now() });
    };

    sendClockPing();
    clockSyncIntervalRef.current = setInterval(sendClockPing, CLOCK_SYNC_INTERVAL_MS);

    return () => {
      if (clockSyncIntervalRef.current) {
        clearInterval(clockSyncIntervalRef.current);
        clockSyncIntervalRef.current = null;
      }
    };
  }, [coordinatorId, isCoordinatorValue, selfPlayer, send, status]);

  const clearWrongAnswerTimer = useCallback(() => {
    if (wrongAnswerTimerRef.current) {
      clearTimeout(wrongAnswerTimerRef.current);
      wrongAnswerTimerRef.current = null;
    }
  }, []);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownSeconds(null);
  }, []);

  const clearReviewCountdown = useCallback(() => {
    if (reviewTimerRef.current) {
      clearInterval(reviewTimerRef.current);
      reviewTimerRef.current = null;
    }
    reviewNextQuestionAtRef.current = null;
    reviewRemainingMsRef.current = null;
    setReviewSecondsRemaining(null);
    setReviewPausedByPlayerId(null);
    setReviewPausedByName(null);
  }, []);

  const clearPendingTyping = useCallback(() => {
    if (pendingTypingTimerRef.current) {
      clearTimeout(pendingTypingTimerRef.current);
      pendingTypingTimerRef.current = null;
    }
    pendingTypingTextRef.current = '';
    lastTypingSendRef.current = 0;
  }, []);

  const resetState = useCallback(() => {
    fetchAbortRef.current?.abort();
    prefetchAbortRef.current?.abort();
    if (joinSyncResolverRef.current) {
      clearTimeout(joinSyncResolverRef.current.timeout);
      joinSyncResolverRef.current = null;
    }
    prefetchedRef.current = null;
    prefetchInFlightKeyRef.current = null;
    prefetchInFlightPromiseRef.current = null;
    preloadedQuestionRef.current = null;
    if (clockSyncIntervalRef.current) {
      clearInterval(clockSyncIntervalRef.current);
      clockSyncIntervalRef.current = null;
    }
    coordinatorClockOffsetRef.current = 0;
    bestClockSyncRttRef.current = null;
    revealPausedAtRef.current = null;
    revealPausedWordIndexRef.current = null;
    currentRevealWordIndexRef.current = null;
    if (buzzTimerRef.current) {
      clearTimeout(buzzTimerRef.current);
      buzzTimerRef.current = null;
    }
    clearCountdownTimer();
    clearReviewCountdown();
    clearWrongAnswerTimer();
    setSessionId(null);
    setGameCode(null);
    setStatus('idle');
    setForcedExitReason(null);
    setPlayers([]);
    setAllPlayers([]);
    setSettings(null);
    setPendingSettings(null);
    setCurrentQuestion(null);
    setCurrentResult(null);
    setCurrentBuzzer(null);
    activeBuzzerIdRef.current = null;
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
    revealPausedAtRef.current = null;
    revealPausedWordIndexRef.current = null;
    currentRevealWordIndexRef.current = null;
    setBuzzQueue([]);
    buzzQueueRef.current = [];
    queuedBuzzWordIndexRef.current = {};
    selfBuzzPendingRef.current = false;
    clearPendingTyping();
    setPromptText(null);
    promptedPlayerRef.current = null;
    setPausedByPlayerId(null);
    setPausedByName(null);
    setReadyPlayers([]);
    setConnectionStatuses({});
    isLeavingSessionRef.current = false;
  }, [clearCountdownTimer, clearPendingTyping, clearReviewCountdown, clearWrongAnswerTimer]);

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

  const applyPendingSettingsForNextQuestion = useCallback(() => {
    const nextSettings = stateRef.current.pendingSettings;
    if (!nextSettings) {
      return stateRef.current.settings;
    }

    setSettings(nextSettings);
    setPendingSettings(null);
    setSummary(prev => prev ? { ...prev, settings: nextSettings } : prev);
    stateRef.current = {
      ...stateRef.current,
      settings: nextSettings,
      pendingSettings: null,
    };
    return nextSettings;
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

  const startBuzzTimer = useCallback((playerId: string, coordinatorDeadline?: number) => {
    clearBuzzTimer();
    const endTime = coordinatorTimeToLocal(
      coordinatorDeadline ?? getCoordinatorNow() + SCORING.BUZZ_TIMEOUT_SECONDS * 1000
    );
    setBuzzTimerEnd(endTime);

    buzzTimerRef.current = setTimeout(() => {
      setBuzzTimerEnd(null);
      if (isCoordinatorFn()) {
        void send({ type: 'buzz:timeout', playerId });
      }
    }, Math.max(0, endTime - Date.now()));
  }, [clearBuzzTimer, coordinatorTimeToLocal, getCoordinatorNow, isCoordinatorFn, send]);

  const getCurrentRevealWordIndex = useCallback(() => {
    const { currentQuestion, revealStartTime, settings } = stateRef.current;
    if (!currentQuestion) return null;
    if (typeof currentRevealWordIndexRef.current === 'number') {
      return currentRevealWordIndexRef.current;
    }
    if (revealStartTime == null || !settings) return null;

    const revealIntervalMs = getRevealIntervalMs(settings.revealSpeed);
    return getVisibleWordCountForTime(
      revealStartTime,
      revealIntervalMs,
      getQuestionWordCount(currentQuestion.question),
    );
  }, []);

  const pauseRevealForBuzz = useCallback((wordIndex?: number) => {
    const pausedWordIndex = typeof wordIndex === 'number'
      ? wordIndex
      : getCurrentRevealWordIndex();

    if (pausedWordIndex == null) {
      return;
    }

    revealPausedWordIndexRef.current = pausedWordIndex;
    currentRevealWordIndexRef.current = pausedWordIndex;

    const { currentQuestion, settings } = stateRef.current;
    const revealIntervalMs = settings ? getRevealIntervalMs(settings.revealSpeed) : 0;
    if (currentQuestion && revealIntervalMs > 0) {
      setRevealStartTime(getRevealStartTimeForWordIndex(
        pausedWordIndex,
        revealIntervalMs,
        Date.now(),
      ));
    }
  }, [getCurrentRevealWordIndex]);

  const getResumedRevealStartTime = useCallback(() => {
    const { currentQuestion, settings } = stateRef.current;
    const pausedWordIndex = revealPausedWordIndexRef.current;
    if (!currentQuestion || pausedWordIndex == null || !settings) {
      return null;
    }

    const revealIntervalMs = getRevealIntervalMs(settings.revealSpeed);
    if (revealIntervalMs <= 0) {
      return null;
    }

    return getRevealStartTimeForWordIndex(
      pausedWordIndex,
      revealIntervalMs,
      getCoordinatorNow(),
    );
  }, [getCoordinatorNow]);

  const clearRevealPause = useCallback(() => {
    revealPausedAtRef.current = null;
    revealPausedWordIndexRef.current = null;
  }, []);

  const applyResumedRevealStartTime = useCallback((resumedRevealStartTime?: number | null) => {
    if (resumedRevealStartTime != null) {
      setRevealStartTime(coordinatorTimeToLocal(resumedRevealStartTime));
    }
    clearRevealPause();
  }, [clearRevealPause, coordinatorTimeToLocal]);

  const applyGamePause = useCallback((
    playerId?: string,
    playerName?: string,
    pausedAt?: number,
    pausedWordIndex?: number,
  ) => {
    setStatus('paused');
    setIsBuzzLocked(true);
    setPausedByPlayerId(playerId ?? null);
    setPausedByName(playerName ?? null);

    const { currentQuestion, currentResult, revealStartTime } = stateRef.current;
    if (currentQuestion && !currentResult && revealStartTime != null) {
      revealPausedAtRef.current = pausedAt != null
        ? coordinatorTimeToLocal(pausedAt)
        : Date.now();
      revealPausedWordIndexRef.current = typeof pausedWordIndex === 'number'
        ? pausedWordIndex
        : getCurrentRevealWordIndex();
    }
  }, [coordinatorTimeToLocal, getCurrentRevealWordIndex]);

  const applyGameResume = useCallback((resumedAt?: number) => {
    const pausedAt = revealPausedAtRef.current;
    const pausedWordIndex = revealPausedWordIndexRef.current;
    if (pausedAt != null) {
      const resumedLocal = resumedAt != null
        ? coordinatorTimeToLocal(resumedAt)
        : Date.now();
      const { currentQuestion, settings } = stateRef.current;
      const revealIntervalMs = settings ? getRevealIntervalMs(settings.revealSpeed) : 0;

      if (currentQuestion && pausedWordIndex != null && revealIntervalMs > 0) {
        currentRevealWordIndexRef.current = pausedWordIndex;
        setRevealStartTime(getRevealStartTimeForWordIndex(
          pausedWordIndex,
          revealIntervalMs,
          resumedLocal,
        ));
      } else {
        const pauseDuration = Math.max(0, resumedLocal - pausedAt);
        if (pauseDuration > 0) {
          setRevealStartTime(previous => (
            previous == null ? previous : previous + pauseDuration
          ));
        }
      }
      clearRevealPause();
    }

    setStatus('playing');
    setIsBuzzLocked(false);
    setPausedByPlayerId(null);
    setPausedByName(null);
  }, [clearRevealPause, coordinatorTimeToLocal]);

  const setAndBroadcastBuzzQueue = useCallback((playerIds: string[]) => {
    queuedBuzzWordIndexRef.current = Object.fromEntries(
      playerIds.map(playerId => [playerId, queuedBuzzWordIndexRef.current[playerId]])
    );
    buzzQueueRef.current = playerIds;
    setBuzzQueue(playerIds);
    void send({ type: 'buzz:queue', playerIds });
  }, [send]);

  const clearBuzzQueue = useCallback((broadcast = false) => {
    queuedBuzzWordIndexRef.current = {};
    buzzQueueRef.current = [];
    setBuzzQueue([]);
    if (broadcast) {
      void send({ type: 'buzz:queue', playerIds: [] });
    }
  }, [send]);

  const removeFromBuzzQueue = useCallback((playerId: string) => {
    delete queuedBuzzWordIndexRef.current[playerId];
    buzzQueueRef.current = buzzQueueRef.current.filter(id => id !== playerId);
    setBuzzQueue(buzzQueueRef.current);
  }, []);

  const grantBuzzLock = useCallback((playerId: string, wordIndex?: number, queuedPlayerIds?: string[]) => {
    const { players } = stateRef.current;
    const buzzer = players.find(p => p.id === playerId) ?? null;
    const nextQueue = queuedPlayerIds ?? buzzQueueRef.current.filter(id => id !== playerId);
    const shouldPauseReveal = !stateRef.current.isBuzzLocked && !activeBuzzerIdRef.current;
    const resolvedLockWordIndex = shouldPauseReveal
      ? getCurrentRevealWordIndex() ?? wordIndex
      : revealPausedWordIndexRef.current ?? wordIndex ?? getCurrentRevealWordIndex();
    const lockWordIndex = resolvedLockWordIndex ?? undefined;

    queuedBuzzWordIndexRef.current = Object.fromEntries(
      nextQueue.map(id => [id, queuedBuzzWordIndexRef.current[id]])
    );
    if (typeof lockWordIndex === 'number') {
      pauseRevealForBuzz(lockWordIndex);
    }

    activeBuzzerIdRef.current = playerId;
    buzzQueueRef.current = nextQueue;
    setBuzzQueue(nextQueue);

    setIsBuzzLocked(true);
    setBuzzWordIndex(lockWordIndex);
    setCurrentBuzzer(buzzer);
    setBuzzerAnswer('');
    setBuzzerResult(null);
    setPromptText(null);
    const buzzDeadline = getCoordinatorNow() + SCORING.BUZZ_TIMEOUT_SECONDS * 1000;
    startBuzzTimer(playerId, buzzDeadline);
    void send({ type: 'buzz:lock', playerId, wordIndex: lockWordIndex, queuedPlayerIds: nextQueue, buzzTimerEnd: buzzDeadline });
  }, [getCoordinatorNow, getCurrentRevealWordIndex, pauseRevealForBuzz, send, startBuzzTimer]);

  const handleBuzzRequest = useCallback((playerId: string, wordIndex?: number) => {
    const { currentQuestion, currentResult, currentBuzzer, lockedOutPlayers, status, isBuzzLocked } = stateRef.current;
    const activeBuzzerId = activeBuzzerIdRef.current ?? currentBuzzer?.id ?? null;
    const currentQueue = buzzQueueRef.current;
    if (!currentQuestion || currentResult || status !== 'playing') return;
    if (lockedOutPlayers.includes(playerId)) return;
    if (activeBuzzerId === playerId || currentQueue.includes(playerId)) return;

    queuedBuzzWordIndexRef.current[playerId] =
      revealPausedWordIndexRef.current ?? getCurrentRevealWordIndex() ?? wordIndex;

    if (isBuzzLocked || activeBuzzerId) {
      setAndBroadcastBuzzQueue([...currentQueue, playerId]);
      return;
    }

    grantBuzzLock(playerId, wordIndex, currentQueue.filter(id => id !== playerId));
  }, [grantBuzzLock, setAndBroadcastBuzzQueue]);

  const grantNextQueuedBuzzer = useCallback((lockedOutPlayerIds: string[]) => {
    const { players } = stateRef.current;
    const activePlayerIds = new Set(players.filter(p => p.status !== 'left').map(p => p.id));
    const nextQueue = buzzQueueRef.current.filter(playerId =>
      activePlayerIds.has(playerId) && !lockedOutPlayerIds.includes(playerId)
    );
    const nextPlayerId = nextQueue[0];

    if (!nextPlayerId) {
      clearBuzzQueue(true);
      return false;
    }

    grantBuzzLock(nextPlayerId, queuedBuzzWordIndexRef.current[nextPlayerId], nextQueue.slice(1));
    return true;
  }, [clearBuzzQueue, grantBuzzLock]);

  // ───────────────────────────────────────────────────────────────────────────
  // Question Pre-fetch & Pre-distribute
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Coordinator: fetch a question and broadcast it to ALL devices as a preload.
   * Called during the answer phase so by the time "Next" is tapped, every device
   * already has the data — zero perceived latency on reveal.
   */
  const prefetchAndDistribute = useCallback(() => {
    const questionSettings = stateRef.current.pendingSettings ?? stateRef.current.settings;
    if (!questionSettings) return;

    const settingsKey = buildSettingsKey(questionSettings);
    if (
      prefetchedRef.current?.settingsKey === settingsKey ||
      preloadedQuestionRef.current?.settingsKey === settingsKey ||
      prefetchInFlightKeyRef.current === settingsKey
    ) {
      return;
    }

    prefetchAbortRef.current?.abort();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;
    prefetchInFlightKeyRef.current = settingsKey;

    const prefetchPromise = fetchRandomTossup(controller.signal, {
      difficulties: questionSettings.difficulties,
      categories: questionSettings.categories,
    }).then(tossup => {
      if (controller.signal.aborted) return;
      const currentSettings = stateRef.current.pendingSettings ?? stateRef.current.settings;
      if (!currentSettings || buildSettingsKey(currentSettings) !== settingsKey) return;

      const pmIndex = findPowerMarkWordIndex(tossup.question);

      // Store locally
      prefetchedRef.current = {
        tossup,
        pmIndex,
        settingsKey,
      };
      preloadedQuestionRef.current = { tossup, pmIndex, settingsKey };

      // Broadcast to all other devices so they have it ready
      void send({ type: 'question:preload', tossup, powerMarkWordIndex: pmIndex, settingsKey });
    }).catch(() => {}).finally(() => {
      if (prefetchInFlightKeyRef.current === settingsKey) {
        prefetchInFlightKeyRef.current = null;
      }
      if (prefetchInFlightPromiseRef.current === prefetchPromise) {
        prefetchInFlightPromiseRef.current = null;
      }
    });
    prefetchInFlightPromiseRef.current = prefetchPromise;
  }, [send]);

  useEffect(() => {
    if (status !== 'lobby' || !settings || !isCoordinatorValue) return;
    prefetchAndDistribute();
  }, [isCoordinatorValue, players.length, prefetchAndDistribute, settings, status]);

  // ───────────────────────────────────────────────────────────────────────────
  // Question/Answer Logic
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Activate the preloaded question on the coordinator's device and send
   * a lightweight "reveal" signal so all other devices start simultaneously.
   */
  const revealPreloadedQuestion = useCallback((questionSettings?: GameSettings | null) => {
    const preloaded = preloadedQuestionRef.current;
    if (!preloaded) return false;
    const effectiveSettings = questionSettings ?? stateRef.current.pendingSettings ?? stateRef.current.settings;
    if (effectiveSettings && preloaded.settingsKey && preloaded.settingsKey !== buildSettingsKey(effectiveSettings)) {
      preloadedQuestionRef.current = null;
      return false;
    }

    preloadedQuestionRef.current = null;
    prefetchedRef.current = null;

    setCurrentResult(null);
    setIsBuzzLocked(false);
    setLockedOutPlayers([]);
    setBuzzerAnswer('');
    setBuzzerResult(null);
    setBuzzWordIndex(undefined);
    clearBuzzQueue();
    setPromptText(null);
    promptedPlayerRef.current = null;
    clearReviewCountdown();
    revealPausedAtRef.current = null;
    revealPausedWordIndexRef.current = null;
    currentRevealWordIndexRef.current = null;
    setPausedByPlayerId(null);
    setPausedByName(null);
    clearBuzzTimer();
    clearWrongAnswerTimer();

    const revealStart = getNextRevealStartTime();
    setPowerMarkWordIndex(preloaded.pmIndex);
    setRevealStartTime(coordinatorTimeToLocal(revealStart));
    setCurrentQuestion(preloaded.tossup);
    addQuestionToSummary(preloaded.tossup, preloaded.pmIndex);
    void send({ type: 'question:reveal', revealStartTime: revealStart });
    setIsLoading(false);
    setStatus('playing');

    // Start pre-fetching the NEXT question for all devices
    prefetchAndDistribute();
    return true;
  }, [send, addQuestionToSummary, clearBuzzTimer, clearBuzzQueue, clearReviewCountdown, clearWrongAnswerTimer, coordinatorTimeToLocal, getNextRevealStartTime, prefetchAndDistribute]);

  /**
   * Fallback: fetch a question on-demand and broadcast with question:new.
   * Used when no preloaded question is available (first question, settings changed).
   */
  const fetchAndBroadcastQuestion = useCallback(async () => {
    const questionSettings = applyPendingSettingsForNextQuestion();
    if (!questionSettings) return;
    const settingsKey = buildSettingsKey(questionSettings);

    // Try the preloaded path first (zero latency)
    if (revealPreloadedQuestion(questionSettings)) return;

    if (
      prefetchInFlightKeyRef.current === settingsKey &&
      prefetchInFlightPromiseRef.current
    ) {
      setIsLoading(true);
      await prefetchInFlightPromiseRef.current;
      if (revealPreloadedQuestion(questionSettings)) return;
    }

    // Fallback: fetch now
    fetchAbortRef.current?.abort();
    prefetchAbortRef.current?.abort();
    prefetchInFlightKeyRef.current = null;
    prefetchInFlightPromiseRef.current = null;

    setIsLoading(true);
    setCurrentResult(null);
    setIsBuzzLocked(false);
    setLockedOutPlayers([]);
    setBuzzerAnswer('');
    setBuzzerResult(null);
    setBuzzWordIndex(undefined);
    clearBuzzQueue();
    setPromptText(null);
    promptedPlayerRef.current = null;
    clearReviewCountdown();
    revealPausedAtRef.current = null;
    revealPausedWordIndexRef.current = null;
    currentRevealWordIndexRef.current = null;
    setPausedByPlayerId(null);
    setPausedByName(null);
    clearBuzzTimer();
    clearWrongAnswerTimer();

    let tossup: Tossup;
    let pmIndex: number | undefined;

    try {
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      tossup = await fetchRandomTossup(controller.signal, {
        difficulties: questionSettings.difficulties,
        categories: questionSettings.categories,
      });
      pmIndex = findPowerMarkWordIndex(tossup.question);
    } catch (err) {
      console.error('Failed to fetch question:', err);
      setIsLoading(false);
      setStatus('playing');
      return;
    }

    const revealStart = getNextRevealStartTime();
    setPowerMarkWordIndex(pmIndex);
    setRevealStartTime(coordinatorTimeToLocal(revealStart));
    setCurrentQuestion(tossup);
    addQuestionToSummary(tossup, pmIndex);
    void send({ type: 'question:new', tossup, powerMarkWordIndex: pmIndex, revealStartTime: revealStart });
    setIsLoading(false);
    setStatus('playing');

    // Pre-fetch + distribute next question to all devices
    prefetchAndDistribute();
  }, [send, addQuestionToSummary, applyPendingSettingsForNextQuestion, clearBuzzTimer, clearBuzzQueue, clearReviewCountdown, clearWrongAnswerTimer, coordinatorTimeToLocal, getNextRevealStartTime, prefetchAndDistribute, revealPreloadedQuestion]);

  const applyReviewStart = useCallback((nextQuestionAt: number) => {
    if (reviewTimerRef.current) {
      clearInterval(reviewTimerRef.current);
      reviewTimerRef.current = null;
    }

    const localNextQuestionAt = coordinatorTimeToLocal(nextQuestionAt);
    reviewNextQuestionAtRef.current = localNextQuestionAt;
    reviewRemainingMsRef.current = null;
    setReviewPausedByPlayerId(null);
    setReviewPausedByName(null);

    const updateReviewCountdown = () => {
      const remainingMs = Math.max(0, localNextQuestionAt - Date.now());
      setReviewSecondsRemaining(Math.ceil(remainingMs / 1000));

      if (remainingMs > 0) {
        return;
      }

      if (reviewTimerRef.current) {
        clearInterval(reviewTimerRef.current);
        reviewTimerRef.current = null;
      }
      reviewNextQuestionAtRef.current = null;
      setReviewSecondsRemaining(null);

      if (
        isCoordinatorFn() &&
        stateRef.current.status === 'playing' &&
        stateRef.current.currentResult &&
        stateRef.current.currentQuestion
      ) {
        void fetchAndBroadcastQuestion();
      }
    };

    updateReviewCountdown();
    reviewTimerRef.current = setInterval(updateReviewCountdown, 250);
  }, [coordinatorTimeToLocal, fetchAndBroadcastQuestion, isCoordinatorFn]);

  const startReviewCountdown = useCallback(() => {
    if (!isCoordinatorFn()) return;
    const nextQuestionAt = getCoordinatorNow() + REVIEW_COUNTDOWN_MS;
    applyReviewStart(nextQuestionAt);
    void send({ type: 'question:review_start', nextQuestionAt });
  }, [applyReviewStart, getCoordinatorNow, isCoordinatorFn, send]);

  const applyReviewPause = useCallback((playerId: string | undefined, playerName: string | undefined, remainingMs: number) => {
    if (reviewTimerRef.current) {
      clearInterval(reviewTimerRef.current);
      reviewTimerRef.current = null;
    }
    reviewNextQuestionAtRef.current = null;
    reviewRemainingMsRef.current = Math.max(0, remainingMs);
    setReviewSecondsRemaining(Math.ceil(reviewRemainingMsRef.current / 1000));
    setReviewPausedByPlayerId(playerId ?? null);
    setReviewPausedByName(playerName ?? null);
  }, []);

  const pauseReview = useCallback(async () => {
    const { currentQuestion, currentResult, selfPlayer } = stateRef.current;
    const nextQuestionAt = reviewNextQuestionAtRef.current;
    if (!currentQuestion || !currentResult || !selfPlayer || !nextQuestionAt || reviewRemainingMsRef.current != null) {
      return;
    }

    const remainingMs = Math.max(0, nextQuestionAt - Date.now());
    if (remainingMs <= 0) {
      return;
    }

    applyReviewPause(selfPlayer.id, selfPlayer.name, remainingMs);
    void send({
      type: 'question:review_pause',
      playerId: selfPlayer.id,
      playerName: selfPlayer.name,
      remainingMs,
    });
  }, [applyReviewPause, send]);

  const resumeReview = useCallback(async () => {
    const remainingMs = reviewRemainingMsRef.current;
    if (remainingMs == null) {
      return;
    }

    const nextQuestionAt = getCoordinatorNow() + remainingMs;
    applyReviewStart(nextQuestionAt);
    void send({ type: 'question:review_resume', nextQuestionAt });
  }, [applyReviewStart, getCoordinatorNow, send]);

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
      setPromptText(resolvePromptDisplayText(result.directedPrompt));
      setBuzzerAnswer('');
      const buzzDeadline = getCoordinatorNow() + SCORING.BUZZ_TIMEOUT_SECONDS * 1000;
      void send({
        type: 'buzz:prompt',
        playerId: buzz.playerId,
        directedPrompt: result.directedPrompt,
        buzzTimerEnd: buzzDeadline,
      });
      startBuzzTimer(buzz.playerId, buzzDeadline);
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
      clearBuzzQueue(true);
      clearRevealPause();
      setCurrentResult(result);
      setCurrentBuzzer(null);
      activeBuzzerIdRef.current = null;
      setBuzzerAnswer('');
      setBuzzerResult(null);
      startReviewCountdown();
    } else {
      const newLockedOut = [...lockedOutPlayers, buzz.playerId];
      setLockedOutPlayers(newLockedOut);
      buzzQueueRef.current = buzzQueueRef.current.filter(playerId => playerId !== buzz.playerId);
      setBuzzQueue(buzzQueueRef.current);
      delete queuedBuzzWordIndexRef.current[buzz.playerId];

      // Show wrong answer to all players
      setBuzzerResult({ answer: resultBuzz.answer, isCorrect: false });
      setBuzzerAnswer(resultBuzz.answer);

      // Check if all *active* players are now locked out
      const activePlayers = players.filter(p => p.status !== 'left');
      const allPlayersLockedOut = activePlayers.every(p => newLockedOut.includes(p.id));

      if (allPlayersLockedOut) {
        // No delay — show final result immediately
        clearBuzzQueue(true);
        setCurrentResult(result);
        setIsBuzzLocked(true);
        setCurrentBuzzer(null);
        activeBuzzerIdRef.current = null;
        setBuzzerResult(null);
        setBuzzerAnswer('');
        clearRevealPause();
        void send({ type: 'buzz:unlock', lockedOutPlayers: newLockedOut, allLockedOut: true, lastResult: result });
        startReviewCountdown();
      } else {
        // Delay unlock so everyone sees the wrong answer briefly
        clearWrongAnswerTimer();
        wrongAnswerTimerRef.current = setTimeout(() => {
          if (grantNextQueuedBuzzer(newLockedOut)) {
            return;
          }
          setCurrentBuzzer(null);
          activeBuzzerIdRef.current = null;
          setBuzzerResult(null);
          setBuzzerAnswer('');
          const resumedRevealStartTime = getResumedRevealStartTime();
          applyResumedRevealStartTime(resumedRevealStartTime);
          setIsBuzzLocked(false);
          setCurrentResult(null);
          void send({
            type: 'buzz:unlock',
            lockedOutPlayers: newLockedOut,
            revealStartTime: resumedRevealStartTime ?? undefined,
          });
        }, SCORING.WRONG_ANSWER_DISPLAY_MS);
      }
    }
  }, [send, addBuzzToSummary, applyResumedRevealStartTime, clearBuzzTimer, clearBuzzQueue, clearRevealPause, clearWrongAnswerTimer, getCoordinatorNow, getResumedRevealStartTime, grantNextQueuedBuzzer, startBuzzTimer, startReviewCountdown]);

  const removeActivePlayer = useCallback((playerId: string) => {
    const s = stateRef.current;
    const removal = buildActivePlayerRemovalUpdate(playerId, {
      players: s.players,
      allPlayers: s.allPlayers,
      readyPlayers: s.readyPlayers,
      lockedOutPlayers: s.lockedOutPlayers,
      hostId: s.hostId,
      summary: s.summary,
      currentBuzzerId: s.currentBuzzer?.id,
      activeBuzzerId: activeBuzzerIdRef.current,
    });

    setConnectionStatuses(prev => ({ ...prev, [playerId]: 'disconnected' }));
    setPlayers(removal.players);
    setAllPlayers(removal.allPlayers);
    setReadyPlayers(removal.readyPlayers);
    setLockedOutPlayers(removal.lockedOutPlayers);
    removeFromBuzzQueue(playerId);

    if (removal.hostId !== s.hostId) {
      setHostId(removal.hostId);
    }

    setSummary(removal.summary);

    if (removal.shouldEndGame) {
      setStatus('ended');
    }

    if (removal.wasActiveBuzzer) {
      clearBuzzTimer();
      clearWrongAnswerTimer();
      clearPendingTyping();
      setCurrentBuzzer(null);
      activeBuzzerIdRef.current = null;
      setBuzzerAnswer('');
      setBuzzerResult(null);
      if (promptedPlayerRef.current === playerId) {
        promptedPlayerRef.current = null;
        setPromptText(null);
      }

      if (s.currentQuestion && !s.currentResult) {
        const resumedRevealStartTime = getResumedRevealStartTime();
        applyResumedRevealStartTime(resumedRevealStartTime);
        setIsBuzzLocked(false);
      }
    }
  }, [
    applyResumedRevealStartTime,
    clearBuzzTimer,
    clearPendingTyping,
    clearWrongAnswerTimer,
    getResumedRevealStartTime,
    removeFromBuzzQueue,
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // Event Handler
  // ───────────────────────────────────────────────────────────────────────────

  const handleEvent = useCallback((event: GameEvent) => {
    if (isLeavingSessionRef.current) return;

    switch (event.type) {
      case 'player:join': {
        setPlayers(prev => uniquePlayersById([...prev, event.player]));

        // Rule 3: Track in allPlayers
        setAllPlayers(prev => uniquePlayersById([...prev, { ...event.player, status: 'active' as const }]));

        setSummary(prev => prev
          ? { ...prev, players: uniquePlayersById([...prev.players, { ...event.player, status: 'active' as const }]) }
          : prev
        );

        // Rule 5: Initialize score for new player
        setScores(prev => event.player.id in prev ? prev : { ...prev, [event.player.id]: 0 });

        // Mark new player as connected
        setConnectionStatuses(prev => ({ ...prev, [event.player.id]: 'connected' }));

        // Rule 5: Sync FULL state to new players. The host is authoritative
        // during lobby setup; a non-host coordinator may not have received
        // host state yet if its random player ID sorts first.
        const s = stateRef.current;
        const shouldSyncAsHost = s.status === 'lobby' && s.selfPlayer?.id === s.hostId;
        const shouldSyncAsCoordinator = s.status !== 'lobby' && isCoordinatorFn();
        const canSyncState = Boolean(
          s.selfPlayer &&
          event.player.id !== s.selfPlayer.id &&
          s.hostId &&
          s.settings &&
          (shouldSyncAsHost || shouldSyncAsCoordinator)
        );
        if (canSyncState) {
          const syncedPlayers = uniquePlayersById([...s.players, event.player]);
          const pausedWordIndex = s.isBuzzLocked
            ? revealPausedWordIndexRef.current ?? getCurrentRevealWordIndex()
            : null;
          const syncPayload: StateSyncPayload = {
            players: syncedPlayers,
            hostId: s.hostId!,
            settings: s.settings!,
            pendingSettings: s.pendingSettings,
            status: s.status,
            currentQuestion: s.currentQuestion ?? undefined,
            currentResult: s.currentResult,
            currentBuzzerId: s.currentBuzzer?.id ?? activeBuzzerIdRef.current,
            powerMarkWordIndex: s.powerMarkWordIndex,
            revealStartTime: s.revealStartTime != null
              ? localTimeToCoordinator(s.revealStartTime)
              : null,
            revealPausedWordIndex: pausedWordIndex,
            isBuzzLocked: s.isBuzzLocked,
            buzzWordIndex: s.buzzWordIndex,
            buzzTimerEnd: s.buzzTimerEnd != null ? localTimeToCoordinator(s.buzzTimerEnd) : null,
            buzzerAnswer: s.buzzerAnswer,
            buzzerResult: s.buzzerResult,
            promptText: s.promptText,
            scores: { ...s.scores, [event.player.id]: s.scores[event.player.id] ?? 0 },
            lockedOutPlayers: s.lockedOutPlayers,
            buzzQueue: s.buzzQueue,
            questionRecords: s.summary?.questions ?? [],
            gameCode: s.gameCode ?? undefined,
            readyPlayers: s.readyPlayers,
            reviewNextQuestionAt: reviewNextQuestionAtRef.current != null
              ? localTimeToCoordinator(reviewNextQuestionAtRef.current)
              : null,
            reviewPausedByPlayerId: s.reviewPausedByPlayerId,
            reviewPausedByName: s.reviewPausedByName,
            reviewRemainingMs: reviewRemainingMsRef.current,
          };
          void send({ type: 'state:sync', targetPlayerId: event.player.id, state: syncPayload });
        }
        const preloaded = preloadedQuestionRef.current;
        if (
          preloaded &&
          s.status === 'lobby' &&
          s.selfPlayer &&
          event.player.id !== s.selfPlayer.id &&
          isCoordinatorFn()
        ) {
          void send({
            type: 'question:preload',
            tossup: preloaded.tossup,
            powerMarkWordIndex: preloaded.pmIndex,
            settingsKey: preloaded.settingsKey,
          });
        }
        break;
      }

      case 'player:leave': {
        removeActivePlayer(event.playerId);
        break;
      }

      case 'players:sync': {
        setPlayers(prev => uniquePlayersById([...prev, ...event.players]));
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
          // Keep the current screen state intact during the pop animation.
          void transportRef.current.disconnect();
          setForcedExitReason('kicked');
          return;
        }
        removeActivePlayer(event.playerId);
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
        setSummary(prev => prev ? { ...prev, hostId: event.newHostId } : prev);
        break;
      }

      case 'game:countdown': {
        setCountdownSeconds(event.seconds);
        if (isCoordinatorFn()) {
          prefetchAndDistribute();
        }
        break;
      }

      case 'game:start': {
        setSettings(event.settings);
        setPendingSettings(null);
        stateRef.current = {
          ...stateRef.current,
          settings: event.settings,
          pendingSettings: null,
        };
        setStatus('playing');
        setIsLoading(true);
        setIsBuzzLocked(false);
        setLockedOutPlayers([]);
        setCurrentResult(null);
        setCurrentBuzzer(null);
        activeBuzzerIdRef.current = null;
        setBuzzWordIndex(undefined);
        clearBuzzQueue();
        setCountdownSeconds(null);
        clearReviewCountdown();
        revealPausedAtRef.current = null;
        revealPausedWordIndexRef.current = null;
        currentRevealWordIndexRef.current = null;
        setPausedByPlayerId(null);
        setPausedByName(null);
        if (event.hostId) setHostId(event.hostId);
        if (isCoordinatorFn()) {
          void fetchAndBroadcastQuestion();
        }
        break;
      }

      case 'game:pause': {
        applyGamePause(event.playerId, event.playerName, event.pausedAt, event.pausedWordIndex);
        break;
      }

      case 'game:resume': {
        applyGameResume(event.resumedAt);
        break;
      }

      case 'game:settings': {
        // Rule 2: Apply settings from host to all players
        prefetchedRef.current = null;
        prefetchInFlightKeyRef.current = null;
        prefetchInFlightPromiseRef.current = null;
        preloadedQuestionRef.current = null;
        prefetchAbortRef.current?.abort();
        if (event.lobby) {
          setPendingSettings(null);
          setSettings(event.settings);
          setSummary(prev => prev ? { ...prev, settings: event.settings } : prev);
          stateRef.current = {
            ...stateRef.current,
            settings: event.settings,
            pendingSettings: null,
          };
          break;
        }
        if (event.deferred) {
          setPendingSettings(event.settings);
          stateRef.current = { ...stateRef.current, pendingSettings: event.settings };
          if (isCoordinatorFn()) {
            prefetchAndDistribute();
          }
          break;
        }
        setPendingSettings(null);
        setSettings(event.settings);
        setSummary(prev => prev ? { ...prev, settings: event.settings } : prev);
        fetchAbortRef.current?.abort();
        setCurrentQuestion(null);
        setCurrentResult(null);
        setCurrentBuzzer(null);
        activeBuzzerIdRef.current = null;
        setStatus('paused');
        setIsBuzzLocked(true);
        setLockedOutPlayers([]);
        setBuzzerAnswer('');
        setBuzzerResult(null);
        setBuzzWordIndex(undefined);
        setPromptText(null);
        promptedPlayerRef.current = null;
        currentRevealWordIndexRef.current = null;
        clearReviewCountdown();
        clearPendingTyping();
        clearBuzzQueue();
        break;
      }

      case 'game:end': {
        setStatus('ended');
        setIsBuzzLocked(true);
        setCurrentBuzzer(null);
        activeBuzzerIdRef.current = null;
        clearBuzzQueue();
        clearBuzzTimer();
        clearWrongAnswerTimer();
        clearCountdownTimer();
        clearReviewCountdown();
        clearPendingTyping();
        if (event.summary) {
          setSummary(event.summary);
        } else {
          setSummary(prev => prev ? { ...prev, endedAt: Date.now() } : prev);
        }
        break;
      }

      case 'question:new': {
        // Fallback path: question data arrives with the reveal signal
        applyPendingSettingsForNextQuestion();
        setCurrentResult(null);
        setCurrentQuestion(event.tossup);
        setCurrentBuzzer(null);
        activeBuzzerIdRef.current = null;
        setIsLoading(false);
        setIsBuzzLocked(false);
        setLockedOutPlayers([]);
        clearBuzzTimer();
        clearWrongAnswerTimer();
        setStatus('playing');
        setPowerMarkWordIndex(event.powerMarkWordIndex);
        setRevealStartTime(
          event.revealStartTime != null
            ? coordinatorTimeToLocal(event.revealStartTime)
            : Date.now()
        );
        setBuzzerAnswer('');
        setBuzzerResult(null);
        setBuzzWordIndex(undefined);
        clearBuzzQueue();
        setPromptText(null);
        promptedPlayerRef.current = null;
        clearReviewCountdown();
        revealPausedAtRef.current = null;
        revealPausedWordIndexRef.current = null;
        currentRevealWordIndexRef.current = null;
        setPausedByPlayerId(null);
        setPausedByName(null);
        clearPendingTyping();
        addQuestionToSummary(event.tossup, event.powerMarkWordIndex);
        break;
      }

      case 'question:preload': {
        const currentSettings = stateRef.current.pendingSettings ?? stateRef.current.settings;
        if (
          event.settingsKey &&
          currentSettings &&
          event.settingsKey !== buildSettingsKey(currentSettings)
        ) {
          break;
        }
        // Coordinator sent the next question early — store it for instant reveal
        preloadedQuestionRef.current = {
          tossup: event.tossup,
          pmIndex: event.powerMarkWordIndex,
          settingsKey: event.settingsKey,
        };
        break;
      }

      case 'question:reveal': {
        // "Go" signal — activate the preloaded question
        const preloaded = preloadedQuestionRef.current;
        if (preloaded) {
          applyPendingSettingsForNextQuestion();
          preloadedQuestionRef.current = null;
          setCurrentResult(null);
          setCurrentQuestion(preloaded.tossup);
          setCurrentBuzzer(null);
          activeBuzzerIdRef.current = null;
          setIsLoading(false);
          setIsBuzzLocked(false);
          setLockedOutPlayers([]);
          clearBuzzTimer();
          clearWrongAnswerTimer();
          setStatus('playing');
          setPowerMarkWordIndex(preloaded.pmIndex);
          setRevealStartTime(coordinatorTimeToLocal(event.revealStartTime));
          setBuzzerAnswer('');
          setBuzzerResult(null);
          setBuzzWordIndex(undefined);
          clearBuzzQueue();
          setPromptText(null);
          promptedPlayerRef.current = null;
          clearReviewCountdown();
          revealPausedAtRef.current = null;
          revealPausedWordIndexRef.current = null;
          currentRevealWordIndexRef.current = null;
          setPausedByPlayerId(null);
          setPausedByName(null);
          clearPendingTyping();
          addQuestionToSummary(preloaded.tossup, preloaded.pmIndex);
        }
        break;
      }

      case 'question:review_start': {
        applyReviewStart(event.nextQuestionAt);
        break;
      }

      case 'question:review_pause': {
        applyReviewPause(event.playerId, event.playerName, event.remainingMs);
        break;
      }

      case 'question:review_resume': {
        applyReviewStart(event.nextQuestionAt);
        break;
      }

      case 'question:request': {
        if (isCoordinatorFn()) {
          void fetchAndBroadcastQuestion();
        }
        break;
      }

      case 'clock:ping': {
        const { selfPlayer } = stateRef.current;
        if (selfPlayer && isCoordinatorFn() && event.playerId !== selfPlayer.id) {
          void send({
            type: 'clock:pong',
            playerId: event.playerId,
            sentAt: event.sentAt,
            coordinatorTime: Date.now(),
          });
        }
        break;
      }

      case 'clock:pong': {
        const { selfPlayer } = stateRef.current;
        if (!selfPlayer || event.playerId !== selfPlayer.id || isCoordinatorFn()) {
          break;
        }

        const receivedAt = Date.now();
        const roundTripMs = receivedAt - event.sentAt;
        if (roundTripMs < 0 || roundTripMs > CLOCK_SYNC_MAX_RTT_MS) {
          break;
        }

        const sampleOffset = event.coordinatorTime + roundTripMs / 2 - receivedAt;
        const bestRoundTrip = bestClockSyncRttRef.current;
        const shouldTrustSample = bestRoundTrip == null || roundTripMs <= bestRoundTrip * 1.5;

        if (bestRoundTrip == null || roundTripMs < bestRoundTrip) {
          bestClockSyncRttRef.current = roundTripMs;
        }

        if (shouldTrustSample) {
          coordinatorClockOffsetRef.current = bestRoundTrip == null
            ? sampleOffset
            : coordinatorClockOffsetRef.current + (sampleOffset - coordinatorClockOffsetRef.current) * CLOCK_SYNC_SMOOTHING;
        }
        break;
      }

      case 'buzz:lock': {
        // Coordinator's authoritative confirmation — clear any optimistic flag.
        selfBuzzPendingRef.current = false;
        if (
          typeof event.wordIndex === 'number' ||
          (!stateRef.current.isBuzzLocked && !activeBuzzerIdRef.current)
        ) {
          pauseRevealForBuzz(event.wordIndex);
        }
        setIsBuzzLocked(true);
        setBuzzerAnswer('');
        setBuzzerResult(null);
        const { players } = stateRef.current;
        const buzzer = players.find(p => p.id === event.playerId) ?? null;
        setCurrentBuzzer(buzzer);
        activeBuzzerIdRef.current = event.playerId;
        setBuzzWordIndex(event.wordIndex);
        buzzQueueRef.current = event.queuedPlayerIds ?? buzzQueueRef.current.filter(id => id !== event.playerId);
        setBuzzQueue(buzzQueueRef.current);
        // Rule 10: Start buzz timer
        startBuzzTimer(event.playerId, event.buzzTimerEnd);
        break;
      }

      case 'buzz:request': {
        if (isCoordinatorFn()) {
          handleBuzzRequest(event.playerId, event.wordIndex);
        }
        break;
      }

      case 'buzz:queue': {
        buzzQueueRef.current = event.playerIds;
        setBuzzQueue(event.playerIds);
        // If we optimistically claimed the lock but the coordinator put us in
        // the queue, revert: someone else won the race.
        const { selfPlayer: queuedSelf } = stateRef.current;
        if (selfBuzzPendingRef.current && queuedSelf && event.playerIds.includes(queuedSelf.id)) {
          selfBuzzPendingRef.current = false;
          if (activeBuzzerIdRef.current === queuedSelf.id) {
            activeBuzzerIdRef.current = null;
          }
          setCurrentBuzzer(prev => (prev?.id === queuedSelf.id ? null : prev));
          clearBuzzTimer();
        }
        break;
      }

      case 'buzz:typing': {
        setBuzzerAnswer(event.text);
        break;
      }

      case 'buzz:prompt': {
        // Player was prompted — give them another chance to answer
        clearPendingTyping();
        setPromptText(resolvePromptDisplayText(event.directedPrompt));
        setBuzzerAnswer('');
        startBuzzTimer(event.playerId, event.buzzTimerEnd);
        break;
      }

      case 'buzz:unlock': {
        selfBuzzPendingRef.current = false;
        clearPendingTyping();
        setLockedOutPlayers(event.lockedOutPlayers);
        setCurrentBuzzer(null);
        activeBuzzerIdRef.current = null;
        setBuzzerResult(null);
        setBuzzerAnswer('');

        if (event.allLockedOut && event.lastResult) {
          clearRevealPause();
          setCurrentResult(event.lastResult);
          setIsBuzzLocked(true);
        } else {
          applyResumedRevealStartTime(
            event.revealStartTime ?? getResumedRevealStartTime()
          );
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
        selfBuzzPendingRef.current = false;
        clearPendingTyping();
        clearBuzzTimer();
        setPromptText(null);

        if (isCorrect) {
          clearRevealPause();
          setCurrentResult(event.buzz.result ?? null);
          setIsBuzzLocked(true);
          setCurrentBuzzer(null);
          activeBuzzerIdRef.current = null;
          setBuzzerAnswer('');
          setBuzzerResult(null);
          clearBuzzQueue();
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
          buzzQueueRef.current = buzzQueueRef.current.filter(playerId => playerId !== event.buzz.playerId);
          setBuzzQueue(buzzQueueRef.current);
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
        if (
          event.questionId &&
          stateRef.current.currentQuestion?.id !== event.questionId
        ) {
          break;
        }
        // No one buzzed — show answer, no points
        if (!stateRef.current.currentResult) {
          setCurrentResult({ directive: 'skip' } as AnswerResult);
          setIsBuzzLocked(true);
          clearBuzzQueue();
        }
        break;
      }

      case 'coordinator:change': {
        // Informational — coordinator is derived from sorted players
        break;
      }

      case 'state:sync': {
        // Rule 5: Full state sync for late joiners
        const targetPlayerId = event.targetPlayerId;
        const localSelfPlayer = stateRef.current.selfPlayer;
        if (targetPlayerId && localSelfPlayer?.id !== targetPlayerId) {
          break;
        }

        const s = event.state;
        if (!s.hostId || !s.settings) {
          break;
        }
        const syncedPlayers = uniquePlayersById(s.players);
        setPlayers(syncedPlayers);
        setAllPlayers(prev => uniquePlayersById([...prev, ...syncedPlayers]));
        setConnectionStatuses(prev => {
          const next = { ...prev };
          for (const player of syncedPlayers) {
            if (player.status !== 'left') {
              next[player.id] = 'connected';
            }
          }
          return next;
        });
        setHostId(s.hostId);
        setSettings(s.settings);
        setPendingSettings(s.pendingSettings ?? null);
        stateRef.current = {
          ...stateRef.current,
          settings: s.settings,
          pendingSettings: s.pendingSettings ?? null,
        };
        setStatus(s.status);
        if (s.currentQuestion) {
          setCurrentQuestion(s.currentQuestion);
          setPowerMarkWordIndex(s.powerMarkWordIndex);
        } else {
          setCurrentQuestion(null);
          setPowerMarkWordIndex(undefined);
        }
        setCurrentResult(s.currentResult ?? null);

        const syncedBuzzer = s.currentBuzzerId
          ? syncedPlayers.find(player => player.id === s.currentBuzzerId) ?? null
          : null;
        setCurrentBuzzer(syncedBuzzer);
        activeBuzzerIdRef.current = s.currentBuzzerId ?? null;
        setIsBuzzLocked(Boolean(s.isBuzzLocked));
        setBuzzWordIndex(s.buzzWordIndex);
        setBuzzerAnswer(s.buzzerAnswer ?? '');
        setBuzzerResult(s.buzzerResult ?? null);
        setPromptText(s.promptText ?? null);

        const revealIntervalMs = getRevealIntervalMs(s.settings.revealSpeed);
        let syncedRevealStartTime = s.revealStartTime != null
          ? coordinatorTimeToLocal(s.revealStartTime)
          : null;
        if (
          s.currentQuestion &&
          s.isBuzzLocked &&
          typeof s.revealPausedWordIndex === 'number' &&
          revealIntervalMs > 0
        ) {
          syncedRevealStartTime = getRevealStartTimeForWordIndex(
            s.revealPausedWordIndex,
            revealIntervalMs,
            Date.now(),
          );
          revealPausedWordIndexRef.current = s.revealPausedWordIndex;
          revealPausedAtRef.current = Date.now();
          currentRevealWordIndexRef.current = s.revealPausedWordIndex;
        } else {
          revealPausedWordIndexRef.current = null;
          revealPausedAtRef.current = null;
          currentRevealWordIndexRef.current =
            s.currentQuestion && syncedRevealStartTime != null
              ? getVisibleWordCountForTime(
                syncedRevealStartTime,
                revealIntervalMs,
                getQuestionWordCount(s.currentQuestion.question),
              )
              : null;
        }
        setRevealStartTime(syncedRevealStartTime);

        if (s.isBuzzLocked && s.currentBuzzerId && s.buzzTimerEnd != null) {
          startBuzzTimer(s.currentBuzzerId, s.buzzTimerEnd);
        } else {
          clearBuzzTimer();
        }
        setScores(s.scores);
        setLockedOutPlayers(s.lockedOutPlayers);
        buzzQueueRef.current = s.buzzQueue ?? [];
        setBuzzQueue(buzzQueueRef.current);
        if (s.gameCode) setGameCode(s.gameCode);
        if (s.readyPlayers) setReadyPlayers(s.readyPlayers);
        if (s.reviewRemainingMs != null) {
          applyReviewPause(
            s.reviewPausedByPlayerId ?? undefined,
            s.reviewPausedByName ?? undefined,
            s.reviewRemainingMs,
          );
        } else if (s.reviewNextQuestionAt != null) {
          applyReviewStart(s.reviewNextQuestionAt);
        } else {
          clearReviewCountdown();
        }
        setSummary(prev => ({
          sessionId: prev?.sessionId ?? stateRef.current.sessionId ?? '',
          players: syncedPlayers,
          hostId: s.hostId,
          settings: s.settings,
          questions: s.questionRecords,
        }));
        if (joinSyncResolverRef.current && localSelfPlayer?.id === joinSyncResolverRef.current.playerId) {
          clearTimeout(joinSyncResolverRef.current.timeout);
          joinSyncResolverRef.current.resolve(s.status);
          joinSyncResolverRef.current = null;
        }
        break;
      }
    }
    }, [isCoordinatorFn, send, addQuestionToSummary, addBuzzToSummary, applyPendingSettingsForNextQuestion, applyResumedRevealStartTime, applyReviewPause, applyReviewStart, clearBuzzTimer, clearBuzzQueue, clearRevealPause, clearReviewCountdown, clearWrongAnswerTimer, clearCountdownTimer, clearPendingTyping, fetchAndBroadcastQuestion, getCurrentRevealWordIndex, getResumedRevealStartTime, judgeAndBroadcastResult, pauseRevealForBuzz, removeActivePlayer, removeFromBuzzQueue, handleBuzzRequest, startBuzzTimer, resetState, prefetchAndDistribute, coordinatorTimeToLocal, localTimeToCoordinator, applyGamePause, applyGameResume]);

  // ───────────────────────────────────────────────────────────────────────────
  // Coordinator Transfer Detection (Rule 4)
  // ───────────────────────────────────────────────────────────────────────────

  const prevCoordinatorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!coordinatorId) {
      prevCoordinatorRef.current = null;
      return;
    }

    if (prevCoordinatorRef.current && prevCoordinatorRef.current !== coordinatorId) {
      // Coordinator changed
      if (selfPlayer && coordinatorId === selfPlayer.id) {
        void send({ type: 'coordinator:change', newCoordinatorId: coordinatorId });

        // If the previous coordinator dropped while a transition was waiting on
        // it, the newly elected coordinator needs to advance the game.
        const s = stateRef.current;
        const reviewIsWaitingForQuestion = Boolean(
          s.status === 'playing' &&
          s.currentQuestion &&
          s.currentResult &&
          reviewNextQuestionAtRef.current == null &&
          reviewRemainingMsRef.current == null
        );
        if ((s.isLoading || reviewIsWaitingForQuestion) && s.status === 'playing') {
          void fetchAndBroadcastQuestion();
        }
      }
    }

    prevCoordinatorRef.current = coordinatorId;
  }, [coordinatorId, selfPlayer, send, fetchAndBroadcastQuestion]);

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
      onPlayerJoined: (playerId, playerName) => {
        const { selfPlayer } = stateRef.current;
        if (!selfPlayer || playerId === selfPlayer.id) return;
        handleEvent({
          type: 'player:join',
          player: { id: playerId, name: playerName || 'Player', status: 'active' },
        });
      },
      onPlayerLeft: (playerId, reason) => {
        // Presence disconnects are authoritative for active membership: closing
        // the app kicks that player from the current game.
        removeActivePlayer(playerId);
      },
      onPlayerReconnected: (playerId) => {
        setConnectionStatuses(prev => ({ ...prev, [playerId]: 'connected' }));
      },
      onHostTransferred: (newHostId) => {
        setHostId(newHostId);
        setSummary(prev => prev ? { ...prev, hostId: newHostId } : prev);
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
  }, [handleEvent, removeActivePlayer]);

  // ───────────────────────────────────────────────────────────────────────────
  // Public Actions
  // ───────────────────────────────────────────────────────────────────────────

  const hostGame = useCallback(async (gameSettings: GameSettings, playerName: string) => {
    await transportRef.current.disconnect();
    transportRef.current = createTransport();
    resetState();

    const id = generateLocalGameCode();
    const player: Player = { id: nanoid(6), name: playerName || 'Player', status: 'active' };

    setSessionId(id);
    setGameCode(id);
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

    try {
      await transportRef.current.startHosting(id, player.name, {
        onEvent: handleEvent,
        onError: err => console.error('Transport error:', err),
      });
    } catch (error) {
      await transportRef.current.disconnect();
      resetState();
      throw error;
    }

    const activeSessionId = transportRef.current.sessionId ?? id;
    setSessionId(activeSessionId);
    setGameCode(activeSessionId.toUpperCase());
    setSummary(prev => prev ? { ...prev, sessionId: activeSessionId } : prev);

    void send({ type: 'player:join', player });

    // For WebSocket transport, the game code is set asynchronously via onRoomCreated.
    // Return the sessionId for navigation — the lobby will display the game code once available.
    return activeSessionId;
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

    try {
      await transportRef.current.joinSession(code, {
        onEvent: handleEvent,
        onError: err => console.error('Transport error:', err),
      });
    } catch (error) {
      await transportRef.current.disconnect();
      resetState();
      throw error;
    }

    const syncedStatusPromise = new Promise<SessionStatus>((resolve) => {
      const timeout = setTimeout(() => {
        if (joinSyncResolverRef.current?.playerId === player.id) {
          joinSyncResolverRef.current = null;
        }
        resolve(stateRef.current.status === 'idle' ? 'lobby' : stateRef.current.status);
      }, JOIN_SYNC_WAIT_MS);

      joinSyncResolverRef.current = { playerId: player.id, resolve, timeout };
    });

    void send({ type: 'player:join', player });
    return syncedStatusPromise;
  }, [handleEvent, resetState, send, setupServerCallbacks]);

  const startNextQuestion = useCallback(async () => {
    const { selfPlayer, hostId: currentHostId } = stateRef.current;
    if (!selfPlayer || selfPlayer.id !== currentHostId) return;
    if (isLoading) return;

    if (isCoordinatorFn()) {
      await fetchAndBroadcastQuestion();
    } else {
      void send({ type: 'question:request' });
    }
  }, [isLoading, isCoordinatorFn, fetchAndBroadcastQuestion, send]);

  /** Called when a player taps the buzz button — locks buzz for everyone. */
  const buzzIn = useCallback(async (wordIndex?: number) => {
    const { selfPlayer, currentQuestion, currentResult, lockedOutPlayers, isBuzzLocked: locked } = stateRef.current;
    if (!currentQuestion || currentResult || !selfPlayer) return;
    if (lockedOutPlayers.includes(selfPlayer.id)) return;
    if (selfBuzzPendingRef.current || activeBuzzerIdRef.current === selfPlayer.id || buzzQueueRef.current.includes(selfPlayer.id)) return;

    if (isCoordinatorFn()) {
      handleBuzzRequest(selfPlayer.id, wordIndex);
      return;
    }

    queuedBuzzWordIndexRef.current[selfPlayer.id] = wordIndex;
    // Optimistic local lock — when no one else is currently buzzing, claim
    // the lock now so the answer input opens instantly. The coordinator's
    // authoritative buzz:lock / buzz:queue arrives ~one round trip later
    // and either confirms (no-op) or overrides (existing handlers replace
    // currentBuzzer / clear via the queue path). Eliminates the perceptible
    // delay between tap and answer-input appearance.
    if (!locked) {
      selfBuzzPendingRef.current = true;
      activeBuzzerIdRef.current = selfPlayer.id;
      pauseRevealForBuzz(wordIndex);
      setIsBuzzLocked(true);
      setCurrentBuzzer(selfPlayer);
      setBuzzWordIndex(wordIndex);
      setBuzzerAnswer('');
      setBuzzerResult(null);
      startBuzzTimer(selfPlayer.id);
    }
    void send({ type: 'buzz:request', playerId: selfPlayer.id, wordIndex, timestamp: Date.now() });
  }, [isCoordinatorFn, handleBuzzRequest, pauseRevealForBuzz, send, startBuzzTimer]);

  /** Called when a player submits their answer (or auto-submits on timer expiry). */
  const submitBuzzAnswer = useCallback(async (answer: string) => {
    const { selfPlayer, currentQuestion, currentResult, buzzWordIndex: currentBuzzWordIndex } = stateRef.current;
    if (!currentQuestion || currentResult || !selfPlayer) return;

    clearPendingTyping();
    clearBuzzTimer();
    const wordIdx = currentBuzzWordIndex ?? queuedBuzzWordIndexRef.current[selfPlayer.id];

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
  }, [isCoordinatorFn, judgeAndBroadcastResult, send, clearBuzzTimer, clearPendingTyping]);

  /**
   * Broadcast current typing to other players. Throttled to one send per
   * TYPING_THROTTLE_MS with a leading-edge fire (first keystroke goes
   * immediately) and a trailing-edge fire (last keystroke in a burst is
   * always delivered). Reduces channel saturation during rapid typing so
   * higher-priority events (buzz:lock, buzz:result) aren't queued behind
   * 5-10 keystroke broadcasts per second.
   */
  const sendBuzzTyping = useCallback((text: string) => {
    const { selfPlayer } = stateRef.current;
    if (!selfPlayer) return;
    const now = Date.now();
    const elapsed = now - lastTypingSendRef.current;

    if (elapsed >= TYPING_THROTTLE_MS) {
      lastTypingSendRef.current = now;
      if (pendingTypingTimerRef.current) {
        clearTimeout(pendingTypingTimerRef.current);
        pendingTypingTimerRef.current = null;
      }
      void send({ type: 'buzz:typing', playerId: selfPlayer.id, text });
      return;
    }

    pendingTypingTextRef.current = text;
    if (pendingTypingTimerRef.current) return;

    const remaining = TYPING_THROTTLE_MS - elapsed;
    pendingTypingTimerRef.current = setTimeout(() => {
      pendingTypingTimerRef.current = null;
      const trailingText = pendingTypingTextRef.current;
      const { selfPlayer: latestSelf } = stateRef.current;
      if (!latestSelf) return;
      lastTypingSendRef.current = Date.now();
      void send({ type: 'buzz:typing', playerId: latestSelf.id, text: trailingText });
    }, remaining);
  }, [send]);

  const syncRevealWordIndex = useCallback((wordIndex: number) => {
    currentRevealWordIndexRef.current = wordIndex;
  }, []);

  /** No one buzzed and the timer expired — show answer, no points. */
  const noBuzzTimeout = useCallback(async (questionId?: string) => {
    const { currentResult, currentQuestion } = stateRef.current;
    if (currentResult || !currentQuestion) return;
    if (questionId && currentQuestion.id !== questionId) return;

    // Show answer locally for all players
    setCurrentResult({ directive: 'skip' } as AnswerResult);
    setIsBuzzLocked(true);
    clearBuzzQueue(true);

    // Coordinator broadcasts to ensure consistency
    if (isCoordinatorFn()) {
      void send({ type: 'question:timeup', questionId: currentQuestion.id });
      startReviewCountdown();
    }
  }, [clearBuzzQueue, isCoordinatorFn, send, startReviewCountdown]);

  const pauseGame = useCallback(async () => {
    const player = stateRef.current.selfPlayer;
    const pausedAt = getCoordinatorNow();
    const pausedWordIndex = getCurrentRevealWordIndex() ?? undefined;
    applyGamePause(player?.id, player?.name, pausedAt, pausedWordIndex);
    void send({
      type: 'game:pause',
      playerId: player?.id,
      playerName: player?.name,
      pausedAt,
      pausedWordIndex,
    });
  }, [applyGamePause, getCoordinatorNow, getCurrentRevealWordIndex, send]);

  const resumeGame = useCallback(async () => {
    const resumedAt = getCoordinatorNow();
    applyGameResume(resumedAt);
    void send({ type: 'game:resume', resumedAt });
  }, [applyGameResume, getCoordinatorNow, send]);

  // Rule 2: Broadcast settings to all players
  const updateSettings = useCallback(async (newSettings: GameSettings, options?: { deferUntilNextQuestion?: boolean; lobbyOnly?: boolean }) => {
    const { selfPlayer, hostId: currentHostId } = stateRef.current;
    if (!selfPlayer || selfPlayer.id !== currentHostId) return;
    const deferUntilNextQuestion = options?.deferUntilNextQuestion === true;
    const lobbyOnly = options?.lobbyOnly === true;
    // Invalidate prefetch + preload since settings changed
    prefetchedRef.current = null;
    prefetchInFlightKeyRef.current = null;
    prefetchInFlightPromiseRef.current = null;
    preloadedQuestionRef.current = null;
    prefetchAbortRef.current?.abort();
    if (lobbyOnly) {
      setPendingSettings(null);
      setSettings(newSettings);
      setSummary(prev => prev ? { ...prev, settings: newSettings } : prev);
      stateRef.current = {
        ...stateRef.current,
        settings: newSettings,
        pendingSettings: null,
      };
      await send({ type: 'game:settings', settings: newSettings, lobby: true });
      return;
    }

    if (deferUntilNextQuestion) {
      setPendingSettings(newSettings);
      stateRef.current = { ...stateRef.current, pendingSettings: newSettings };
      await send({ type: 'game:settings', settings: newSettings, deferred: true });
      if (isCoordinatorFn()) {
        prefetchAndDistribute();
      }
      return;
    }

    setPendingSettings(null);
    setSettings(newSettings);
    setSummary(prev => prev ? { ...prev, settings: newSettings } : prev);
    stateRef.current = {
      ...stateRef.current,
      settings: newSettings,
      pendingSettings: null,
    };
    fetchAbortRef.current?.abort();
    setCurrentQuestion(null);
    setCurrentResult(null);
    setCurrentBuzzer(null);
    activeBuzzerIdRef.current = null;
    setIsBuzzLocked(true);
    setLockedOutPlayers([]);
    setBuzzerAnswer('');
    setBuzzerResult(null);
    setBuzzWordIndex(undefined);
    setPromptText(null);
    promptedPlayerRef.current = null;
    currentRevealWordIndexRef.current = null;
    clearReviewCountdown();
    clearPendingTyping();
    clearBuzzQueue(true);
    setStatus('paused');
    await send({ type: 'game:settings', settings: newSettings });
  }, [clearBuzzQueue, clearPendingTyping, clearReviewCountdown, isCoordinatorFn, prefetchAndDistribute, send]);

  // Host-only: force end game for everyone
  const endGame = useCallback(async () => {
    const { summary } = stateRef.current;
    const finalSummary = summary ? { ...summary, endedAt: Date.now() } : null;

    await send({ type: 'game:end', summary: finalSummary ?? undefined });
    await transportRef.current.disconnect();
    setStatus('ended');
    setSummary(finalSummary);
    activeBuzzerIdRef.current = null;
    clearBuzzQueue();
    clearBuzzTimer();
    clearWrongAnswerTimer();
    clearCountdownTimer();
    clearReviewCountdown();
    clearPendingTyping();
  }, [send, clearBuzzQueue, clearBuzzTimer, clearWrongAnswerTimer, clearCountdownTimer, clearReviewCountdown, clearPendingTyping]);

  // Rule 1: Graceful leave without ending game for others
  const leaveGame = useCallback(async () => {
    if (isLeavingSessionRef.current) return;
    isLeavingSessionRef.current = true;

    const { selfPlayer } = stateRef.current;
    setStatus('ended');

    if (selfPlayer) {
      await send({ type: 'player:leave', playerId: selfPlayer.id });
    }
    await transportRef.current.disconnect();
    activeBuzzerIdRef.current = null;
    clearBuzzQueue();
    clearBuzzTimer();
    clearWrongAnswerTimer();
    clearCountdownTimer();
    clearReviewCountdown();
    clearPendingTyping();
  }, [send, clearBuzzQueue, clearBuzzTimer, clearWrongAnswerTimer, clearCountdownTimer, clearReviewCountdown, clearPendingTyping]);

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
    handleEvent({ type: 'player:kick', playerId });
    void send({ type: 'player:kick', playerId });

    // Also tell the server to kick (for WebSocket transport)
    if (transportRef.current instanceof SupabaseTransport) {
      transportRef.current.kickPlayer(playerId);
    }
  }, [handleEvent, isHostValue, send]);

  const transferHost = useCallback(async (newHostId: string) => {
    if (!isHostValue) return;
    setHostId(newHostId);
    setSummary(prev => prev ? { ...prev, hostId: newHostId } : prev);
    await send({ type: 'host:transfer', newHostId });

    // Also tell the server
    if (transportRef.current instanceof SupabaseTransport) {
      transportRef.current.transferHost(newHostId);
    }
  }, [isHostValue, send]);

  const startGameCountdown = useCallback(() => {
    if (!isHostValue) return;
    if (countdownTimerRef.current) return;
    const { settings, hostId: currentHostId } = stateRef.current;
    if (!settings || !currentHostId) return;
    if (isCoordinatorFn()) {
      prefetchAndDistribute();
    }

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
        setPendingSettings(null);
        setStatus('playing');
        setIsLoading(true);
        setIsBuzzLocked(false);
        setLockedOutPlayers([]);
        setCurrentResult(null);
        setCurrentBuzzer(null);
        activeBuzzerIdRef.current = null;
        setBuzzWordIndex(undefined);
        clearBuzzQueue();

        // Initialize summary for the new game
        setSummary({
          sessionId: s.sessionId ?? '',
          players: uniquePlayersById(s.players),
          hostId: s.hostId ?? '',
          settings: s.settings!,
          questions: [],
        });

        if (isCoordinatorFn()) {
          void fetchAndBroadcastQuestion();
        }
      }
    }, 1000);
  }, [clearBuzzQueue, fetchAndBroadcastQuestion, isCoordinatorFn, isHostValue, prefetchAndDistribute, send]);

  const completeForcedExit = useCallback(() => {
    resetState();
  }, [resetState]);

  const acknowledgeForcedExit = useCallback(() => {
    setForcedExitReason(null);
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Context Value
  // ───────────────────────────────────────────────────────────────────────────

  const value = useMemo<MultiplayerContextValue>(() => ({
    sessionId,
    gameCode,
    status,
    forcedExitReason,
    players,
    allPlayers,
    settings,
    pendingSettings,
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
    buzzQueuePosition,
    pausedByPlayerId,
    pausedByName,
    reviewSecondsRemaining,
    reviewPausedByPlayerId,
    reviewPausedByName,
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
    syncRevealWordIndex,
    noBuzzTimeout,
    pauseGame,
    resumeGame,
    pauseReview,
    resumeReview,
    updateSettings,
    endGame,
    leaveGame,
    toggleReady,
    kickPlayer,
    transferHost,
    startGameCountdown,
    acknowledgeForcedExit,
    completeForcedExit,
  }), [
    sessionId, gameCode, status, forcedExitReason, players, allPlayers, settings, pendingSettings, currentQuestion, currentResult, currentBuzzer,
    isLoading, isBuzzLocked, isSelfLockedOut, summary, selfPlayer,
    hostId, scores, isHostValue, isCoordinatorValue, buzzTimerEnd, revealStartTime,
    buzzerAnswer, buzzerResult, promptText, buzzQueuePosition, pausedByPlayerId, pausedByName,
    reviewSecondsRemaining, reviewPausedByPlayerId, reviewPausedByName,
    readyPlayers, connectionStatuses, countdownSeconds, playerColors,
    hostGame, joinGame, startNextQuestion, buzzIn, submitBuzzAnswer, sendBuzzTyping, syncRevealWordIndex, noBuzzTimeout,
    pauseGame, resumeGame, pauseReview, resumeReview, updateSettings, endGame, leaveGame,
    toggleReady, kickPlayer, transferHost, startGameCountdown, acknowledgeForcedExit, completeForcedExit,
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
