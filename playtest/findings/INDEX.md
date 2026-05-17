# Playtest Findings — Index

This file lists every finding produced by `/playtest`. Claude reads this before each run to avoid re-finding known issues.

Each row links to a finding file in this directory: `YYYY-MM-DD-NNN.md`.

| Date       | ID  | Area          | Status   | One-line summary                |
|------------|-----|---------------|----------|---------------------------------|
| 2026-05-04 | 001 | single-player | fixed    | Answer submit button overlapped the tab bar |
| 2026-05-04 | 002 | multiplayer   | fixed    | No-buzz timeout showed the answer as Incorrect |
| 2026-05-04 | 003 | multiplayer   | fixed    | Loopback host lobby never displayed a game code |
| 2026-05-16 | 004 | multiplayer   | fixed    | Three real simulator clients could diverge in lobby state sync |
| 2026-05-16 | 005 | multiplayer   | fixed    | Stale no-buzz timeout skipped the next question |
| 2026-05-16 | 006 | multiplayer   | fixed    | Same-name non-host could resume during host settings pause |
| 2026-05-16 | 007 | multiplayer   | fixed    | Host Settings Cancel could still catch up the reveal |
| 2026-05-16 | 008 | multiplayer   | fixed    | Invalid game route could render a dead 0-player game |
| 2026-05-16 | 009 | multiplayer   | fixed    | Next question could reuse full-reveal state |

Statuses: `open`, `fixed`, `deferred`, `wontfix`, `cant-repro`.
