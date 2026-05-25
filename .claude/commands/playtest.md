---
description: Autonomous QA loop — play the app on iOS sim, try to break it, fix issues, repeat.
allowed-tools:
  - Bash(npx expo start:*)
  - Bash(xcrun simctl:*)
  - Bash(pgrep:*)
  - Bash(pkill:*)
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(git stash:*)
  - Read
  - Edit
  - Write
  - Glob
  - Grep
---

# /playtest — autonomous play-and-fix loop

You are an autonomous QA agent. Drive the QuizBowl iOS app on the simulator via the `ios-simulator` MCP server, deliberately try to break it, observe failures, fix the underlying code, and verify via Fast Refresh.

Read [CLAUDE.md](../../CLAUDE.md) before starting if you don't already have it in context — it lists fragile areas and hard rules.

## Preflight

1. Confirm a sim is booted: `xcrun simctl list devices booted`. If none, abort with a one-line message.
2. Confirm `idb_companion` is running: `pgrep -f idb_companion`. If not, abort.
3. Confirm Metro is running: `pgrep -f "expo start"`. If not, run `npx expo start --ios` in the background with `EXPO_PUBLIC_QBREADER_MOCK=1 EXPO_PUBLIC_USE_PAIRED_LOOPBACK=1` set, and wait for `Bundling complete` in the output before proceeding.
4. Read [playtest/findings/INDEX.md](../../playtest/findings/INDEX.md) to get the list of known findings — do not re-find what's already there with status `open` or `deferred`.

## Flow Rotation

Cycle through these flows. Pick the next one not run this session, in order:

1. **single-player**: tap Play overlay, answer 5 tossups with a mix of: correct answer, prompt answer (`Einstein` then `Albert Einstein` in mock mode), empty answer, 500-char garbage, rapid double-submit, SKIP spam, navigate away + back mid-question.
2. **mp-host**: navigate to Multiplayer tab → Start a Game → fill name → select granular difficulties/presets and categories → Start. In Lobby: Start playtest peer (Settings tab dev tools). When peer joins, Start Game. Play 3 questions; observe coordinator behavior, locked-out reveal, prompt directives, review countdown, and whether `Preparing next question...` is only transient.
3. **mp-join**: navigate to Multiplayer tab → Join. Try invalid codes (5 chars, 6 chars no game, wrong format). Then host on a separate flow and join with the bot to verify happy path.
4. **settings**: change difficulties to single level, preset, non-contiguous levels, and All; rapid-toggle categories; drag reveal speed slider through full range; return to Play tab and verify changes apply.
5. **backgrounding**: during single-player active question, send app to background (`xcrun simctl spawn booted launchctl asuser $UID xcrun simctl io booted home`) for 5 seconds, then foreground; verify state.

## Adversarial Input Menu

Pick 1-2 per flow:
- Empty string submit
- 500-character garbage string
- Unicode / emoji answer
- Rapid double-tap (fire 2 taps within 100ms via `simctl ui` or two MCP `tap` calls in quick succession)
- Rapid SKIP taps in single-player
- Close/terminate a multiplayer peer during lobby, active buzz, locked-out reveal, and review countdown
- Force-quit mid-fetch: `xcrun simctl terminate booted host.exp.Exponent` then relaunch
- Network simulation: `xcrun simctl status_bar booted override --dataNetwork none` (restore with `clear`)

## Detection

After every interaction:
- Screenshot via the MCP server.
- Read `describe_ui` and **filter to elements with non-empty `accessibilityLabel`** before reasoning. Token budget matters.
- Tail Metro stdout. Grep for `Warning:`, `Error:`, `Possible Unhandled Promise Rejection`, `RedBox`, `[supabase-transport] error`.
- Compare against last-known-good snapshot in `playtest/snapshots/<flow>.json` if present. On first run per flow, write the snapshot.

A finding is anything that:
- Throws an uncaught error in Metro logs.
- Produces a RedBox.
- Leaves the UI in a state where the expected next interactive element is missing.
- Diverges from the last-known-good snapshot in a way that isn't explained by your input (e.g., player count drops to 0 after a single tap).
- Leaves multiplayer stuck on `Preparing next question...` longer than the fetch/handoff transition.
- Shows disconnected or closed-app players as active participants.
- Lets difficulty/category settings become empty.

## On Finding

1. Write `playtest/findings/YYYY-MM-DD-NNN.md` with:
   - **Flow**: which rotation step
   - **Repro**: the exact input sequence
   - **Observed**: log excerpt + screenshot path
   - **Expected**: what should have happened
   - **Suspected file**: the file you think is responsible (read it before claiming)
   - **Status**: `open`
2. Append a row to [playtest/findings/INDEX.md](../../playtest/findings/INDEX.md).
3. Read the suspected file. Propose a minimal fix.
4. Apply the fix via Edit. Save the diff.
5. Wait for `Reloading...` in Metro stdout (Fast Refresh). If it doesn't appear within 5s, send `R,R` keypress to the sim.
6. Re-run the failing flow step. If the issue is gone, mark finding `fixed` in the row and append the diff hash. If not, attempt up to 4 more fixes; on the 5th failed attempt, `git stash` the changes and mark the finding `deferred — needs human`. Move on.

## Stop Conditions

Stop when ANY is true:
- 3 consecutive flow rotations produce zero new findings.
- 60 minutes wallclock since `/playtest` started.
- Same finding hits 5 failed fix attempts.

On stop, print a summary: rotations completed, findings opened, findings fixed, findings deferred. Do not commit anything — let the user review.

## Hard Don'ts

- **Never** run `expo run:ios` (5+ min native rebuild — see CLAUDE.md hard rules).
- **Never** modify files under `ios/` or `android/`.
- **Never** install npm packages.
- **Never** delete `server/` or `services/multiplayer/ws-transport.ts`.
- **Never** commit changes — only stage if asked.
- If a fix touches a context provider or transport file, watch the next reload extra carefully — provider changes don't always Fast-Refresh cleanly.
