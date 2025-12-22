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

import type {
  MultiplayerEvent,
  MultiplayerPlayer,
  MultiplayerSessionStatus,
  MultiplayerSettings,
  MultiplayerSessionSummary,
  MultiplayerQuestionRecord,
} from '@/types/multiplayer';
import { createTransport } from '@/services/multiplayer/transport';
import { fetchRandomTossup } from '@/services/qbreader';
import checkAnswer from 'qb-answer-checker';
import type { AnswerResult, Tossup } from '@/types/qb';

type MultiplayerContextValue = {
  sessionId: string | null;
  status: MultiplayerSessionStatus;
  players: MultiplayerPlayer[];
  settings?: MultiplayerSettings;
  summary?: MultiplayerSessionSummary;
  currentQuestion?: Tossup;
  currentResult?: AnswerResult;
  loadingQuestion: boolean;
  buzzLocked: boolean;
  hostSession: (settings: MultiplayerSettings, playerName: string) => Promise<string>;
  joinSession: (sessionId: string, playerName: string) => Promise<void>;
  startNextQuestion: () => Promise<void>;
  submitBuzz: (answer: string) => Promise<void>;
  endSession: () => Promise<void>;
};

const MultiplayerContext = createContext<MultiplayerContextValue | undefined>(undefined);

export function MultiplayerProvider({ children }: PropsWithChildren) {
  const transportRef = useRef(createTransport());
  const selfPlayerRef = useRef<MultiplayerPlayer | null>(null);
  const playersRef = useRef<MultiplayerPlayer[]>([]);
  const settingsRef = useRef<MultiplayerSettings>();
  const currentQuestionRef = useRef<Tossup>();
  const currentResultRef = useRef<AnswerResult>();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<MultiplayerSessionStatus>('idle');
  const [players, setPlayers] = useState<MultiplayerPlayer[]>([]);
  const [settings, setSettings] = useState<MultiplayerSettings>();
  const [summary, setSummary] = useState<MultiplayerSessionSummary>();
  const [currentQuestion, setCurrentQuestion] = useState<Tossup>();
  const [currentResult, setCurrentResult] = useState<AnswerResult>();
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [buzzLocked, setBuzzLocked] = useState(false);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);

  useEffect(() => {
    currentResultRef.current = currentResult;
  }, [currentResult]);

  const computeCoordinatorId = useCallback((list: MultiplayerPlayer[]) => {
    if (list.length === 0) return null;
    return [...list].sort((a, b) => a.id.localeCompare(b.id))[0].id;
  }, []);

  const isSelfCoordinator = useCallback(
    (list?: MultiplayerPlayer[]) => {
      const playersToCheck = list ?? playersRef.current;
      const coordinatorId = computeCoordinatorId(playersToCheck);
      return Boolean(coordinatorId && selfPlayerRef.current?.id === coordinatorId);
    },
    [computeCoordinatorId]
  );

  const ensureSummary = useCallback(
    (settingsOverride?: MultiplayerSettings) => {
      const effectiveSettings = settingsOverride ?? settingsRef.current;
      if (!effectiveSettings) return;
      setSummary((prev) => {
        if (prev) return prev;
        return {
          sessionId: sessionId ?? 'local',
          players: playersRef.current,
          settings: effectiveSettings,
          questions: [],
        };
      });
    },
    [sessionId]
  );

  const addQuestionToSummary = useCallback(
    (tossup: Tossup) => {
      ensureSummary();
      setSummary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          questions: [...prev.questions, { question: tossup, buzzes: [] }],
        };
      });
    },
    [ensureSummary]
  );

  const appendBuzzToSummary = useCallback((buzz: MultiplayerQuestionRecord['buzzes'][number], winnerId?: string) => {
    setSummary((prev) => {
      if (!prev || prev.questions.length === 0) return prev;
      const updatedQuestions = [...prev.questions];
      const idx = updatedQuestions.length - 1;
      const question = updatedQuestions[idx];
      updatedQuestions[idx] = {
        ...question,
        buzzes: [...question.buzzes, buzz],
        winnerId: winnerId ?? question.winnerId,
      };
      return { ...prev, questions: updatedQuestions };
    });
  }, []);

  const performStartNextQuestion = useCallback(async () => {
    const activeSettings = settingsRef.current;
    if (!activeSettings) {
      console.warn('Cannot start question without settings');
      return;
    }
    setLoadingQuestion(true);
    setCurrentResult(undefined);
    setBuzzLocked(false);
    ensureSummary(activeSettings);
    try {
      const tossup = await fetchRandomTossup(new AbortController().signal, {
        difficulties: activeSettings.difficulties,
        categories: activeSettings.categories,
      });
      setCurrentQuestion(tossup);
      addQuestionToSummary(tossup);
      setStatus('in_progress');
      await transportRef.current.send({
        type: 'session:start',
        payload: { settings: activeSettings, seed: nanoid(6) },
      });
      await transportRef.current.send({
        type: 'question:new',
        payload: { tossup, seed: tossup.id ?? nanoid(6) },
      });
    } catch (err) {
      console.error('Failed to fetch multiplayer tossup', err);
    } finally {
      setLoadingQuestion(false);
    }
  }, [addQuestionToSummary, ensureSummary]);

  const handleIncomingBuzz = useCallback(
    async (buzz: MultiplayerQuestionRecord['buzzes'][number]) => {
      if (!currentQuestionRef.current || !isSelfCoordinator()) {
        return;
      }
      setBuzzLocked(true);
      if (currentResultRef.current) {
        return;
      }
      const result = checkAnswer(
        currentQuestionRef.current.answerHtml || currentQuestionRef.current.answer,
        buzz.answer.trim()
      ) as AnswerResult;
      const payload = { ...buzz, result };
      setCurrentResult(result);
      appendBuzzToSummary(payload, buzz.playerId);
      await transportRef.current.send({ type: 'buzz:result', payload });
    },
    [appendBuzzToSummary, isSelfCoordinator]
  );

  const handleEvent = useCallback(
    (event: MultiplayerEvent) => {
      if (event.type === 'player:joined') {
        let nextPlayers: MultiplayerPlayer[] | undefined;
        setPlayers((prev) => {
          const exists = prev.some((p) => p.id === event.payload.id);
          const next = exists ? prev : [...prev, event.payload];
          nextPlayers = next;
          return next;
        });
        setSummary((prev) => {
          if (!prev) return prev;
          const exists = prev.players.some((p) => p.id === event.payload.id);
          return exists ? prev : { ...prev, players: [...prev.players, event.payload] };
        });
        const mergedPlayers = nextPlayers ?? playersRef.current;
        if (isSelfCoordinator(mergedPlayers) && settingsRef.current) {
          void transportRef.current.send({ type: 'players:sync', payload: { players: mergedPlayers } });
          void transportRef.current.send({
            type: 'session:start',
            payload: { settings: settingsRef.current, seed: currentQuestionRef.current?.id ?? nanoid(6) },
          });
          if (currentQuestionRef.current) {
            void transportRef.current.send({
              type: 'question:new',
              payload: { tossup: currentQuestionRef.current, seed: currentQuestionRef.current.id ?? nanoid(6) },
            });
          }
        }
        return;
      }

      if (event.type === 'players:sync') {
        const incoming = event.payload.players;
        setPlayers((prev) => {
          const merged = [...prev];
          incoming.forEach((player) => {
            if (!merged.some((p) => p.id === player.id)) {
              merged.push(player);
            }
          });
          return merged;
        });
        setSummary((prev) => {
          if (!prev) return prev;
          const mergedPlayers = [...prev.players];
          incoming.forEach((player) => {
            if (!mergedPlayers.some((p) => p.id === player.id)) {
              mergedPlayers.push(player);
            }
          });
          return { ...prev, players: mergedPlayers };
        });
        return;
      }

      if (event.type === 'player:left') {
        let nextPlayers: MultiplayerPlayer[] | undefined;
        setPlayers((prev) => {
          const next = prev.filter((p) => p.id !== event.payload.playerId);
          nextPlayers = next;
          return next;
        });
        setSummary((prev) =>
          prev ? { ...prev, players: prev.players.filter((p) => p.id !== event.payload.playerId) } : prev
        );
        if ((nextPlayers ?? playersRef.current).length === 0) {
          setStatus('ended');
          setBuzzLocked(true);
          setSummary((prev) => (prev ? { ...prev, endedAt: Date.now() } : prev));
        }
        return;
      }

      if (event.type === 'session:start') {
        setSettings(event.payload.settings);
        ensureSummary(event.payload.settings);
        setStatus('in_progress');
        setBuzzLocked(false);
        return;
      }

      if (event.type === 'session:end') {
        setStatus('ended');
        setBuzzLocked(true);
        setSummary((prev) => (prev ? { ...prev, endedAt: Date.now() } : prev));
        return;
      }

      if (event.type === 'question:next') {
        if (isSelfCoordinator() && !loadingQuestion) {
          void performStartNextQuestion();
        }
        return;
      }

      if (event.type === 'question:new') {
        setCurrentResult(undefined);
        setCurrentQuestion(event.payload.tossup);
        addQuestionToSummary(event.payload.tossup);
        setStatus('in_progress');
        setBuzzLocked(false);
        return;
      }

      if (event.type === 'buzz:result') {
        setCurrentResult(event.payload.result as AnswerResult | undefined);
        appendBuzzToSummary(event.payload, event.payload.playerId);
        setBuzzLocked(true);
        return;
      }
    },
    [addQuestionToSummary, appendBuzzToSummary, ensureSummary, isSelfCoordinator, loadingQuestion, performStartNextQuestion]
  );

  const handleEventWithBuzz = useCallback(
    (event: MultiplayerEvent) => {
      if (event.type === 'buzz') {
        setBuzzLocked(true);
        void handleIncomingBuzz(event.payload);
        return;
      }
      if (event.type === 'buzz:result') {
        setBuzzLocked(true);
      }
      handleEvent(event);
    },
    [handleEvent, handleIncomingBuzz]
  );

  const hostSession = useCallback(
    async (nextSettings: MultiplayerSettings, playerName: string) => {
      const id = nanoid(8);
      const player: MultiplayerPlayer = { id: nanoid(6), name: playerName || 'Player' };
      selfPlayerRef.current = player;
      settingsRef.current = nextSettings;
      setSessionId(id);
      setStatus('lobby');
      setSettings(nextSettings);
      setPlayers([player]);
      setSummary({
        sessionId: id,
        players: [player],
        settings: nextSettings,
        questions: [],
      });

      await transportRef.current.startHosting(id, {
        onEvent: handleEventWithBuzz,
        onError: (err) => console.error('Multiplayer transport error', err),
        onPeerChange: () => {},
      });
      await transportRef.current.send({ type: 'player:joined', payload: player });
      return id;
    },
    [handleEventWithBuzz]
  );

  const joinSession = useCallback(
    async (id: string, playerName: string) => {
      const player: MultiplayerPlayer = { id: nanoid(6), name: playerName || 'Player' };
      selfPlayerRef.current = player;
      setSessionId(id);
      setStatus('lobby');
      setPlayers((prev) => [...prev, player]);

      await transportRef.current.joinSession(id, {
        onEvent: handleEventWithBuzz,
        onError: (err) => console.error('Multiplayer transport error', err),
        onPeerChange: () => {},
      });
      await transportRef.current.send({ type: 'player:joined', payload: player });
    },
    [handleEventWithBuzz]
  );

  const endSession = useCallback(async () => {
    const playerId = selfPlayerRef.current?.id;
    if (playerId) {
      await transportRef.current.send({ type: 'player:left', payload: { playerId } });
    }
    await transportRef.current.disconnect();
    setStatus('ended');
    setCurrentQuestion(undefined);
    setCurrentResult(undefined);
    setLoadingQuestion(false);
    setBuzzLocked(false);
  }, []);

  const startNextQuestion = useCallback(async () => {
    if (loadingQuestion) {
      return;
    }
    if (!settingsRef.current && settings) {
      settingsRef.current = settings;
    }
    if (!settingsRef.current) {
      console.warn('Cannot start question without settings');
      return;
    }
    if (!isSelfCoordinator()) {
      await transportRef.current.send({
        type: 'question:next',
        payload: { requesterId: selfPlayerRef.current?.id ?? 'player' },
      });
      return;
    }
    await performStartNextQuestion();
  }, [isSelfCoordinator, loadingQuestion, performStartNextQuestion, settings]);

  const submitBuzz = useCallback(
    async (answer: string) => {
      if (!currentQuestionRef.current) {
        return;
      }
      setBuzzLocked(true);
      const timestamp = Date.now();
      if (isSelfCoordinator()) {
        const result = checkAnswer(
          currentQuestionRef.current.answerHtml || currentQuestionRef.current.answer,
          answer.trim()
        ) as AnswerResult;
        const buzzPayload: MultiplayerQuestionRecord['buzzes'][number] = {
          playerId: selfPlayerRef.current?.id ?? 'player',
          timestamp,
          answer,
          result,
        };
        setCurrentResult(result);
        appendBuzzToSummary(buzzPayload, buzzPayload.playerId);
        await transportRef.current.send({ type: 'buzz:result', payload: buzzPayload });
        return;
      }
      const buzzPayload: MultiplayerQuestionRecord['buzzes'][number] = {
        playerId: selfPlayerRef.current?.id ?? 'player',
        timestamp,
        answer,
      };
      await transportRef.current.send({ type: 'buzz', payload: buzzPayload });
    },
    [appendBuzzToSummary, isSelfCoordinator]
  );

  const value = useMemo(
    () => ({
      sessionId,
      status,
      players,
      settings,
      summary,
      currentQuestion,
      currentResult,
      loadingQuestion,
      buzzLocked,
      hostSession,
      joinSession,
      startNextQuestion,
      submitBuzz,
      endSession,
    }),
    [
      buzzLocked,
      currentQuestion,
      currentResult,
      endSession,
      hostSession,
      joinSession,
      loadingQuestion,
      players,
      sessionId,
      settings,
      startNextQuestion,
      status,
      submitBuzz,
      summary,
    ]
  );

  return <MultiplayerContext.Provider value={value}>{children}</MultiplayerContext.Provider>;
}

export function useMultiplayer() {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) {
    throw new Error('useMultiplayer must be used within MultiplayerProvider');
  }
  return ctx;
}
