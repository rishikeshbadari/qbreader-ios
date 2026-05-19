# QBReader

A lightweight iOS-first quizbowl app inspired by and powered by [QB Reader](https://www.qbreader.org/) and the open-source [qbreader/website](https://github.com/qbreader/website).

QB Reader is a text-based quizbowl packet reader with single-player and multiplayer play, a large searchable question database, answer checking, and API access. This app keeps the mobile experience focused: fast tossup practice, low-friction multiplayer, local history, and simple settings.

## Relationship to QB Reader

This project is a smaller Expo / React Native client, not a replacement for the full QB Reader website.

- Uses the QB Reader API for tossups and metadata.
- Uses `qb-answer-checker` for answerline judging.
- Focuses on a native-feeling iOS interface for reading, buzzing, settings, history, and multiplayer rooms.
- Does not include the full website feature set such as database search, accounts, Geoword, frequency lists, packet tools, or site-wide community stats.

Questions come from QB Reader’s database, which is built from packets hosted on [quizbowlpackets.com](https://quizbowlpackets.com/). Respect the original packet authors’ rights and non-commercial usage expectations.

## Features

- Single-player tossup practice with progressive reveal and answer checking.
- Local History with All, Correct, Skipped, and Incorrect views.
- Category, difficulty, and reveal-speed settings.
- Multiplayer rooms with game codes, host settings, ready states, synced reveal timing, buzzing, queueing, and summaries.
- Supabase Realtime transport for production multiplayer.
- Mock QBReader and loopback multiplayer modes for simulator playtesting.

## Tech Stack

- Expo + React Native
- Expo Router
- TypeScript
- Supabase Realtime
- QB Reader API
- `qb-answer-checker`

## Getting Started

Install dependencies:

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
npm run lint
npx tsc --noEmit
```

For deterministic local multiplayer playtesting:

```bash
EXPO_PUBLIC_QBREADER_MOCK=1 EXPO_PUBLIC_USE_PAIRED_LOOPBACK=1 npx expo start --ios
```

That mode uses mocked questions and an in-process paired transport. Use the default start command for real cross-device Supabase multiplayer.

## Project Map

- `app/(tabs)/index.tsx` — single-player Play tab.
- `app/(tabs)/history.tsx` — local single-player history.
- `app/(tabs)/settings.tsx` — categories, difficulties, reveal speed, and contact links.
- `app/(tabs)/multiplayer.tsx` — multiplayer hub.
- `app/multiplayer/` — host, join, lobby, game, rules, summary, and match history routes.
- `context/QuizSessionContext.tsx` — single-player question queue, judging, and history.
- `context/MultiplayerContext.tsx` — multiplayer state machine, syncing, host/coordinator behavior, buzzing, and summaries.
- `context/SettingsContext.tsx` — persisted user preferences.
- `services/qbreader.ts` — QB Reader API access and normalization.
- `services/multiplayer/` — Supabase, loopback, and test transports.
- `components/quiz/` — shared game, history, stats, and input UI.

## Notes for Contributors

- Keep Expo Go compatibility.
- Avoid native module additions unless necessary.
- Keep changes focused and test with at least one iOS simulator.
- Multiplayer correctness depends on coordinator and non-coordinator paths staying in sync.
- When changing question flow, test buzzing, wrong answers, skips, late joins, and host settings changes.

## Credits

This app builds on the QB Reader ecosystem:

- [qbreader/website](https://github.com/qbreader/website) — the full web app.
- [QB Reader API docs](https://www.qbreader.org/tools/api-docs/) — API reference.
- [qbreader/python-module](https://github.com/qbreader/python-module) — Python API wrapper.
- [qb-answer-checker](https://github.com/qbreader/qb-answer-checker) — answerline checking.
