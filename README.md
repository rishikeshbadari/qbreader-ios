# QBReader

A lightweight iOS-first quizbowl app inspired by and powered by [QB Reader](https://www.qbreader.org/) and the open-source [qbreader/website](https://github.com/qbreader/website).

QB Reader is a text-based quizbowl packet reader with single-player and multiplayer play, a large searchable question database, answer checking, and API access. This app keeps the mobile experience focused: fast tossup practice, low-friction multiplayer, local history, and simple settings.

## Relationship to QB Reader

This project is a smaller Expo / React Native client, not a replacement for the full QB Reader website.

- Uses the QB Reader API for tossups and metadata.
- Uses `qb-answer-checker` for answerline judging.
- Focuses on a native-feeling iOS interface for reading, buzzing, settings, history, and multiplayer rooms.
- Does not include the full website feature set such as database search, accounts, Geoword, frequency lists, packet tools, or site-wide community stats.

Questions come from QB Reader's database, which is built from packets hosted on [quizbowlpackets.com](https://quizbowlpackets.com/). Respect the original packet authors' rights and non-commercial usage expectations.

## Features

- Single-player tossup practice with progressive reveal, answer checking, one-retry prompts, local history, and an in-question skip button.
- Category, reveal-speed, and granular 1-10 difficulty settings.
- Difficulty presets for Middle School `[1]`, High School `[2, 3, 4, 5]`, College `[6, 7, 8, 9, 10]`, plus All.
- Multiplayer rooms with game codes, host settings, ready states, synced reveal timing, buzzing, prompt handling, queueing, host transfer, presence cleanup, and summaries.
- Supabase Realtime transport for production multiplayer.
- Mock QBReader and loopback multiplayer modes for deterministic simulator playtesting.

## Tech Stack

- Expo + React Native
- Expo Router
- TypeScript
- Supabase Realtime Broadcast + Presence
- QB Reader API
- `qb-answer-checker`
- Node's built-in test runner for local pure-logic tests

## Getting Started

Install dependencies only when needed:

```bash
npm install
```

Start the Expo dev server:

```bash
npx expo start --ios
```

Use Expo Go. Do not run `expo run:ios` or `expo run:android` unless you intentionally want a native rebuild.

## Useful Commands

```bash
npm test
npx tsc --noEmit
npm run lint
```

`npm test` compiles the pure TypeScript modules listed in `tsconfig.test.json` into `.test-build`, then runs `node --test __tests__/*.test.js`.

For deterministic local playtesting:

```bash
EXPO_PUBLIC_QBREADER_MOCK=1 EXPO_PUBLIC_USE_PAIRED_LOOPBACK=1 npx expo start --ios
```

That mode uses mocked questions and an in-process paired transport. Use the default start command for real cross-device Supabase multiplayer.

## Runtime Modes

- Default Expo mode: real QBReader API and Supabase transport when Supabase config is present.
- `EXPO_PUBLIC_QBREADER_MOCK=1`: deterministic mock tossups from `services/qbreader.ts`.
- `EXPO_PUBLIC_USE_PAIRED_LOOPBACK=1`: in-process multiplayer bus for local host/peer playtests.
- No Supabase config: falls back to one-client `LoopbackTransport`.

## Project Map

- `app/(tabs)/index.tsx` — single-player Play tab.
- `app/(tabs)/history.tsx` — local single-player history.
- `app/(tabs)/settings.tsx` — categories, granular difficulties, reveal speed, contact links, and playtest dev tools.
- `app/(tabs)/multiplayer.tsx` — multiplayer hub.
- `app/multiplayer/` — host, join, lobby, game, rules, summary, and match history routes.
- `components/quiz/QuizGameLayout.tsx` — shared question layout, answer overlay, prompt display, timers, and footer accessory support.
- `components/quiz/DifficultySelector.tsx` — presets plus 1-10 difficulty controls.
- `context/QuizSessionContext.tsx` — single-player question queue, prefetching, judging, prompt retry, skip, and history.
- `context/MultiplayerContext.tsx` — multiplayer state machine, syncing, host/coordinator behavior, buzzing, prompts, settings updates, presence cleanup, and summaries.
- `context/SettingsContext.tsx` — persisted user preferences.
- `services/qbreader.ts` — QB Reader API access, retries, normalization, mock fixtures, and filter options.
- `services/multiplayer/` — Supabase, loopback, and test transports.
- `utils/` — pure helpers for settings, difficulty, reveal timing, multiplayer membership, scoring, prompt/session rules, and text.
- `__tests__/` — local Node tests for pure app behavior.

## Core Behavior Notes

Single-player:

- Questions are prefetched aggressively to keep next-question latency low.
- Changing filters aborts stale fetches and clears current question/result/prompt state.
- Empty answer means skipped.
- `SKIP` records the current tossup as skipped and immediately loads the next question. A short in-flight guard prevents spam from creating parallel transitions.
- Prompt answers show a visible `Prompt: ...` hint and allow exactly one retry.

Multiplayer:

- The host owns game settings and start/end controls.
- The coordinator is the first online active player by lexicographic player ID. The coordinator fetches questions and judges answers.
- Questions are double-buffered with `question:preload` and revealed with `question:reveal`; `question:new` is the fallback path.
- Wrong answers lock that player out while reveal resumes for others.
- Presence disconnects remove players from active state. Host transfer and coordinator election should keep the game moving when someone leaves.
- After a result, the review panel usually shows a countdown. `Preparing next question...` should only be a short transition while the coordinator fetches or hands off.

## Notes for Contributors and Agents

- Start with `AGENTS.md` or `CLAUDE.md` for hard rules, fragile areas, and playtest notes.
- Keep Expo Go compatibility.
- Avoid native module additions unless necessary.
- Prefer moving business rules into `utils/` and adding local tests.
- Multiplayer correctness depends on coordinator and non-coordinator paths staying in sync.
- When changing question flow, test buzzing, prompts, wrong answers, skips, late joins, app close/disconnect, host settings changes, and host transfer.

## Credits

This app builds on the QB Reader ecosystem:

- [qbreader/website](https://github.com/qbreader/website) — the full web app.
- [QB Reader API docs](https://www.qbreader.org/tools/api-docs/) — API reference.
- [qbreader/python-module](https://github.com/qbreader/python-module) — Python API wrapper.
- [qb-answer-checker](https://github.com/qbreader/qb-answer-checker) — answerline checking.
