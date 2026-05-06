import type { Buzz, GameEvent, Player } from '@/types/multiplayer';
import { PairedLoopbackTransport } from './transport';

/**
 * Minimal bot peer for the autonomous /playtest loop.
 *
 * Joins a multiplayer session via PairedLoopbackTransport and reacts to
 * coordinator events with realistic-but-deterministic behavior:
 *   - announces itself (player:join) and marks ready
 *   - on question:reveal, after a randomized delay, submits a buzz
 *   - on buzz:prompt directed at it, retries with a fixed answer
 *
 * The bot's player ID is suffixed with `~zz` so it sorts last alphabetically,
 * leaving the host as coordinator. This is what exercises host-vs-peer
 * divergence — the very thing the loop is meant to probe.
 *
 * Not loaded in production builds; only the /playtest command spawns it.
 */

const BOT_ID = 'zzzzzz-playtest-bot';
const BOT_NAME = 'PlaytestBot';

type BotState = {
  transport: PairedLoopbackTransport;
  sessionId: string;
  buzzTimer?: ReturnType<typeof setTimeout>;
};

let active: BotState | null = null;

export async function startPlaytestPeer(sessionId: string): Promise<void> {
  if (active) await stopPlaytestPeer();

  const transport = new PairedLoopbackTransport();
  const state: BotState = { transport, sessionId };
  active = state;

  await transport.joinSession(sessionId, {
    onEvent: (event) => handleEvent(state, event),
    onError: (error) => console.warn('[playtest-peer] error', error),
  });

  const player: Player = {
    id: BOT_ID,
    name: BOT_NAME,
    status: 'active',
    ready: false,
    connectionStatus: 'connected',
  };

  await transport.send({ type: 'player:join', player });
  setTimeout(() => {
    if (active === state) {
      transport.send({ type: 'player:ready', playerId: BOT_ID, ready: true });
    }
  }, 500);
}

export async function stopPlaytestPeer(): Promise<void> {
  if (!active) return;
  if (active.buzzTimer) clearTimeout(active.buzzTimer);
  await active.transport.send({ type: 'player:leave', playerId: BOT_ID });
  await active.transport.disconnect();
  active = null;
}

export function isPlaytestPeerActive(): boolean {
  return active !== null;
}

function handleEvent(state: BotState, event: GameEvent) {
  switch (event.type) {
    case 'question:new':
    case 'question:reveal':
      scheduleBuzz(state);
      break;
    case 'buzz:lock':
      if (event.playerId === BOT_ID) {
        scheduleAnswer(state, 250, event.wordIndex);
      }
      break;
    case 'buzz:prompt':
      if (event.playerId === BOT_ID) {
        scheduleAnswer(state, 250);
      }
      break;
    case 'game:end':
      stopPlaytestPeer();
      break;
  }
}

function scheduleBuzz(state: BotState, fixedDelay?: number) {
  if (state.buzzTimer) clearTimeout(state.buzzTimer);
  const delay = fixedDelay ?? 800 + Math.floor(Math.random() * 2200);
  state.buzzTimer = setTimeout(() => {
    if (active !== state) return;
    state.transport.send({
      type: 'buzz:request',
      playerId: BOT_ID,
      timestamp: Date.now(),
    });
  }, delay);
}

function scheduleAnswer(state: BotState, delay: number, wordIndex?: number) {
  if (state.buzzTimer) clearTimeout(state.buzzTimer);
  state.buzzTimer = setTimeout(() => {
    if (active !== state) return;
    const buzz: Buzz = {
      playerId: BOT_ID,
      timestamp: Date.now(),
      answer: pickAnswer(),
      wordIndex,
    };
    state.transport.send({ type: 'buzz:submit', buzz });
  }, delay);
}

const ANSWER_POOL = [
  'einstein',
  'shakespeare',
  'paris',
  'mitochondria',
  'napoleon',
  'beethoven',
  'oxygen',
  '',
];

function pickAnswer(): string {
  return ANSWER_POOL[Math.floor(Math.random() * ANSWER_POOL.length)];
}
