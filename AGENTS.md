# QBReader — Codex Notes

Expo / React Native quizbowl app. Single-player reads tossups from the QBReader API. Multiplayer uses Supabase Realtime Broadcast + Presence in production and loopback transports for local testing.

## Hard Rules

- Never run `expo run:ios` or `expo run:android`. Use Expo Go with `npx expo start --ios`.
- Never edit `ios/` or `android/`.
- Never run `npm install`, `yarn install`, or `pnpm install` without asking first.
- Never delete `server/` or `services/multiplayer/ws-transport.ts`; they are legacy but user-owned.
- Never modify the Supabase credentials in `app.json`.
- Avoid native dependencies. Expo Go compatibility matters.
- Use `rg` for search and prefer focused local tests before simulator work.

## Quickstart

Start the app:

```bash
npx expo start --ios
```

Wait for `Bundling complete` before driving a simulator. A simulator must already be booted:

```bash
xcrun simctl list devices booted
```

Local verification:

```bash
npm test
npx tsc --noEmit
npm run lint
```

Deterministic local playtest mode:

```bash
EXPO_PUBLIC_QBREADER_MOCK=1 EXPO_PUBLIC_USE_PAIRED_LOOPBACK=1 npx expo start --ios
```

That mode uses mock tossups and `PairedLoopbackTransport`, which lets one app process host a game while an in-process peer joins. The Settings tab "Dev Tools" section is gated by `EXPO_PUBLIC_USE_PAIRED_LOOPBACK === '1'`; it is not shown just because `__DEV__` is true.

The autonomous playtest command currently lives at `.claude/commands/playtest.md`.

## App Map

- `app/(tabs)/index.tsx` — single-player Play tab.
- `app/(tabs)/history.tsx` — local single-player history.
- `app/(tabs)/settings.tsx` — persisted categories, granular difficulty, reveal speed, contact links, and loopback dev tools when enabled.
- `app/(tabs)/multiplayer.tsx` — multiplayer hub.
- `app/multiplayer/host.tsx` — create room and initial multiplayer settings.
- `app/multiplayer/join.tsx` — join by code.
- `app/multiplayer/lobby.tsx` — lobby settings, ready states, kick, start.
- `app/multiplayer/game.tsx` — live multiplayer game, host settings modal, review countdown, pause/resume, host transfer.
- `app/multiplayer/summary.tsx` and `app/multiplayer/history.tsx` — multiplayer results.

Shared UI:

- `components/quiz/QuizGameLayout.tsx` — shared single-player and multiplayer question surface, answer overlay, buzz timer, prompt hint, no-buzz timer, and footer accessory support.
- `components/quiz/QuestionCard.tsx` — progressive reveal, scrolling question text, metadata, answer/result display, and footer accessory spacing.
- `components/quiz/DifficultySelector.tsx` — presets plus 1-10 difficulty buttons.
- `components/quiz/AnswerInput.tsx`, `ChipSelector.tsx`, `HistoryList.tsx`, `StatsOverview.tsx` — reusable quiz UI.

State and services:

- `context/QuizSessionContext.tsx` — single-player queue, prefetch, answer judging, skip, prompt, and history.
- `context/MultiplayerContext.tsx` — multiplayer state machine, coordinator election, state sync, preloading/reveal, buzzing, prompts, scoring, presence, host transfer, and game cleanup.
- `context/SettingsContext.tsx` — AsyncStorage-backed settings and filter options.
- `services/qbreader.ts` — QBReader API fetches, normalization, retry/abort handling, mock fixtures.
- `services/multiplayer/supabase-transport.ts` — production Broadcast + Presence.
- `services/multiplayer/transport.ts` — transport interface, single-client `LoopbackTransport`, and test-only `PairedLoopbackTransport`.
- `utils/*.ts` — pure logic that should be unit-tested when changed.

## Product Behavior

Single-player:

- `playState` is `idle | active | paused`. Leaving the Play tab mid-question pauses the reveal.
- The provider keeps a warm queue: fast prefetch for the next question plus batch prefetch up to `PREFETCH_TARGET = 10`, refilling below `PREFETCH_LOW_WATER = 3`.
- Changing categories or difficulties aborts stale fetches, clears current question/result/prompt state, and warms a new queue after a short debounce.
- Empty answers are recorded as `skip`.
- The small `SKIP` button exists only in single-player. It records the current tossup as skipped and immediately starts loading the next question. It is guarded by `skipInFlightRef` plus a 350 ms cooldown so spamming cannot launch parallel transitions.
- Prompt directives allow exactly one retry. The visible input hint should stay generic: `Prompt: Be more specific`, even if `qb-answer-checker` returns a directed prompt.
- History is newest-first and capped by `MAX_HISTORY_ENTRIES = 200`.

Settings:

- Difficulty selection is numeric 1-10 everywhere, not only broad groups.
- Presets are: Middle School `[1]`, High School `[2, 3, 4, 5]`, College `[6, 7, 8, 9, 10]`, and All `[1...10]`.
- Users can toggle individual levels or select a preset. The settings helpers must never allow an empty difficulty or category selection.
- API calls send the selected numeric `difficulties` list and selected category names.
- Persisted settings must tolerate old or malformed AsyncStorage values.

Multiplayer:

- Flow is `multiplayer tab -> host | join -> lobby -> game -> summary`.
- Players have stable random IDs. The coordinator is the lexicographically first active, online player ID. The host controls settings and game start, but the coordinator fetches questions and judges answers.
- Production transport uses Supabase Broadcast for game events and Presence for join/leave/disconnect. Presence disconnects are authoritative: closing the app should remove that player from the active game.
- Multiplayer preloads with `question:preload` and starts reveal with lightweight `question:reveal`. `question:new` is the fallback when preload is not available.
- Non-coordinators should not fetch or judge. They receive state from `state:sync`, `question:preload`, `question:reveal`, `buzz:*`, and review events.
- The current buzzer has the answer input. Other players see an overlay with buzzer name, typing, prompt, or wrong-answer flash.
- Wrong answers lock that player out for the rest of the current question, but reveal resumes for everyone else. If all active players are locked out, the answer is shown and review starts.
- Prompt directives are coordinator-judged. The first prompt sends `buzz:prompt` and reopens the prompted player's input. A second prompt for the same buzz is converted to reject.
- Review after a result normally shows `Next question in Ns`. `Preparing next question...` appears only when there is a result but the review countdown has no active timer. It should be transient while the coordinator fetches/reveals the next tossup or after a coordinator handoff. If it sticks, inspect coordinator election, prefetch invalidation, and `fetchAndBroadcastQuestion`.
- Host settings during an unresolved question are deferred to the next question. Host settings during review pause review and apply to the next question. Settings are locked while a buzz is active.
- Leaving, app close, disconnect, or kick removes the player from active players, ready list, locked-out list, and buzz queue. If the host leaves, host transfers to the first eligible online player. If the last active player leaves, the game ends.

## Unit Tests

`npm test` compiles selected pure TypeScript files to `.test-build` using `tsconfig.test.json`, then runs Node's built-in test runner against `__tests__/*.test.js`.

Current coverage includes:

- `__tests__/quizCore.test.js` — directive labels, reveal timing, single-player filters, prompt retry/display, history, session stats.
- `__tests__/settings.test.js` — persisted settings parsing, reveal speed clamping, granular difficulty labels/toggles/replacement, category guards.
- `__tests__/multiplayer.test.js` — online/coordinator helpers, lobby readiness, host transfer candidates, Supabase presence reconciliation, active player removal, scoring, match history.
- `__tests__/qbreader.test.js` — QBReader URL building, tossup normalization, fallback categories/difficulties.

When adding behavior, push pure rules into `utils/` where possible and add local tests. Use simulators for interaction and realtime integration after local tests pass.

## Simulator / Playtest Notes

- Use `EXPO_PUBLIC_QBREADER_MOCK=1` for deterministic tossups.
- The first mock tossup is Einstein. Answer `Einstein` should prompt with `Prompt: Be more specific`; retry `Albert Einstein` should accept.
- Reliable mock categories include `History`, `Literature`, and `Science`.
- Player names for multiplayer fuzz: `Alice`, `Bob`, `Charlie`.
- Simulator keyboard automation may not always trigger React Native `TextInput` submit exactly like a real user. Verify UI and logs, but do not contort app code just to satisfy a brittle automation path.

## Fragile Areas

1. Locked-out reveal: wrong players are locked out while others keep reading.
2. Coordinator divergence: only the coordinator fetches/judges, but every client must converge.
3. Coordinator handoff during loading or review: the new coordinator must advance the game.
4. Prompt and anti-prompt handling: one retry only; second prompt becomes reject.
5. Single-player prefetch races: stale AbortController results must not show after settings changes.
6. Skip spam: the cooldown/in-flight guard must prevent parallel next-question transitions.
7. Difficulty migration: old broad-group settings and malformed persisted settings must resolve to valid 1-10 selections.
8. Presence disconnects: closed apps must be removed from active multiplayer state and from coordinator eligibility.
9. Network failures: QBReader fetch errors should surface "Unable to reach QB Reader" without crashing.
10. In-game multiplayer settings: changing settings must invalidate stale preload/prefetch state.

## Reading Logs

Metro stdout:

```bash
grep -E "Warning:|Error:|Possible Unhandled Promise Rejection|RedBox|\\[supabase-transport\\]"
```

Native Expo logs:

```bash
xcrun simctl spawn booted log stream --level=debug --predicate 'processImagePath contains "Expo"'
```

## User Preferences

- Keep responses concise and concrete.
- Test real-device and simulator paths when relevant.
- Multiplayer changes must consider coordinator and non-coordinator paths.
- The user has strong product intuition; preserve intended behavior unless explicitly changing it.
