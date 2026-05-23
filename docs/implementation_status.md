# Shapes Implementation Status

## Done

- Monorepo workspace with `apps/web`, `apps/server`, and `packages/game-engine`.
- Pure game engine with deterministic deck generation, seeded shuffle, action validation, scoring, player-specific views, and state validation.
- Standard actions: give Insight, play card, discard card.
- Shape, rank, and pattern clues.
- Two-player shared draft row.
- End states: third Crack, final turns, and perfect blueprint completion.
- Objective scoring for the first starter objective set.
- Unit and simulation tests.
- Local web prototype with hidden-card perspective, clue counts, clue history, discard filters, score panel, draft row, and localStorage recovery.
- In-memory multiplayer server with room lifecycle, stale version rejection, hidden player views, and SSE room streams.

## Not Done Yet

- Real persistent backend storage.
- Production authentication.
- Deployed multiplayer web flow.
- External playtest feedback form.
- Tutorial.
- Account history and profiles.
- Mobile app.

## Recommended Next Engineering Step

Integrate `apps/web` with `apps/server` behind a mode switch:

```text
Local Table
Online Room
```

The online room mode should use the existing server endpoints first, then replace the in-memory room store with Supabase once the client flow is correct.

