# QuizBowl — Claude Code Notes

Expo / React Native quiz app. Single-player tossups from QBReader API + multiplayer via Supabase Realtime Broadcast (with a `LoopbackTransport` for in-process testing).

## Quickstart

Start the dev server (no native rebuild — keep Expo Go working):

```
npx expo start --ios
```

Wait for `Bundling complete` in stdout before driving the simulator. The booted iOS sim must be running first; check with `xcrun simctl list devices booted`.

For the autonomous playtest loop, see `.claude/commands/playtest.md`.

The "Dev Tools" section in Settings (Reset state, Start/Stop playtest peer) is gated by `process.env.EXPO_PUBLIC_USE_PAIRED_LOOPBACK === '1'`, **not** by `__DEV__`. It only renders during a `/playtest` run. To use those buttons manually, start Metro with `EXPO_PUBLIC_USE_PAIRED_LOOPBACK=1`. See README.md for details.

## App Map

- **Tabs** ([app/(tabs)/](app/(tabs)/)):
  - [index.tsx](app/(tabs)/index.tsx) — Play screen (single-player). `playState`: idle | active | paused.
  - [history.tsx](app/(tabs)/history.tsx) — past sessions, filterable.
  - [settings.tsx](app/(tabs)/settings.tsx) — difficulty/category chips, reveal speed slider.
  - [multiplayer.tsx](app/(tabs)/multiplayer.tsx) — multiplayer hub.
- **Multiplayer flow** ([app/multiplayer/](app/multiplayer/)):
  - `index → host | join → lobby → game → summary` (plus `rules`, `history`)
- **State**:
  - [QuizSessionContext.tsx](context/QuizSessionContext.tsx) — single-player; prefetches 2 questions ahead via `AbortController`.
  - [MultiplayerContext.tsx](context/MultiplayerContext.tsx) — ~1300 lines; coordinator election (alphabetically first player ID), double-buffer preloading via `question:preload` + `question:reveal`.
  - [SettingsContext.tsx](context/SettingsContext.tsx) — preferences persisted to AsyncStorage.
- **Services**:
  - [qbreader.ts](services/qbreader.ts) — `fetchRandomTossup` from `qbreader.org/api/random-tossup`. Honors `EXPO_PUBLIC_QBREADER_MOCK=1` for deterministic fixtures (set this for the playtest loop).
  - [supabase-transport.ts](services/multiplayer/supabase-transport.ts) — production: Broadcast + Presence.
  - [transport.ts](services/multiplayer/transport.ts) — `MultiplayerTransport` interface, factory, `LoopbackTransport`, `PairedLoopbackTransport` (test-only, host+peer in one process).
- **Answer judging**: `qb-answer-checker` library, directives `accept | prompt | reject | anti-prompt | skip`. `prompt` shows a hint and allows one retry; second attempt is rejected.

## Fragile Areas (probe these deliberately)

1. **Locked-out reveal**: when a player buzzes incorrectly, they're locked out for the rest of the question — but the question keeps revealing for non-locked players. Coordinator vs. non-coordinator divergence is the failure mode.
2. **Coordinator-vs-non-coordinator divergence**: only the coordinator fetches and judges. State sync via `question:preload` and `question:reveal`. Easy to break by forcing a coordinator change mid-question.
3. **Prefetch race in [QuizSessionContext.tsx](context/QuizSessionContext.tsx)**: aborting an in-flight fetch while a new one starts.
4. **Answer-judging directives**: `prompt` and `anti-prompt` are easy to mis-handle on retry — second attempt should be reject, not another prompt.
5. **AsyncStorage migration**: shape changes in `SettingsContext` will silently strand old persisted state.
6. **Network drop on [qbreader.ts](services/qbreader.ts) fetch**: error path should surface "Unable to reach QB Reader" without crashing the session.

## Reading Logs

- Metro stdout (foreground): grep for `Warning:`, `Error:`, `Possible Unhandled Promise Rejection`, `[supabase-transport]`.
- Native red-box / app logs:
  ```
  xcrun simctl spawn booted log stream --level=debug --predicate 'processImagePath contains "Expo"'
  ```

## Test Data

- Player names for multiplayer fuzz: `Alice`, `Bob`, `Charlie` (alphabetical so coordinator = Alice).
- Categories that reliably return tossups in mock mode: `History`, `Literature`, `Science`.
- Tricky answer for prompt-directive regression: try `Einstein` for a question accepting `Albert Einstein` (should `prompt` for first name, accept on retry).

## Hard Rules

- **Never** run `expo run:ios` or `expo run:android` — those trigger 5+ minute native rebuilds the loop doesn't need. Use `expo start` only.
- **Never** edit `ios/` or `android/` directories.
- **Never** `npm install` / `yarn install` / `pnpm install` without asking the user first.
- **Never** delete `server/` or `services/multiplayer/ws-transport.ts` — legacy but user-owned.
- **Never** modify `app.json` Supabase credentials.
- Avoid native module deps. Expo Go must keep working.

## Loop Stop Conditions

The `/playtest` command stops on any of:
- 3 consecutive flow rotations with zero new findings, OR
- 60-minute wallclock, OR
- 5 failed fix attempts on the same finding (escalate, `git stash` attempts).

## User Preferences

- Concise responses. State results, don't narrate.
- Real-device + simulator testing. Coordinator and non-coordinator paths matter.
- Strong product intuition; user catches things in review.
