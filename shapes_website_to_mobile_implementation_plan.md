# Shapes — Website-to-Mobile Implementation Plan

This document describes a practical implementation plan for building **Shapes** first as a web game, then expanding it into a mobile app for iOS and Android.

The guiding principle is:

> Build the game once as a clean, testable rules engine, then place different user interfaces on top of it.

The first product should be a playable website. The second product should be a mobile app that reuses the same core game logic, data model, backend, account system, and multiplayer protocol.

---

# 1. Product Strategy

## 1.1 Why Start with a Website?

Starting with a website is the best first step because it is faster to test, easier to share, and simpler to update.

A web version lets you:

- Send a link to testers immediately.
- Avoid app store review delays during early development.
- Iterate rules, UI, and balance quickly.
- Test multiplayer flow before investing in mobile polish.
- Build the backend architecture once.
- Validate whether people actually enjoy the game.

The first website does not need to look like a final commercial product. Its job is to prove that the game works digitally.

## 1.2 Why Move to Phones Later?

A phone version is valuable because **Shapes** is a social card game. Phones are convenient for casual multiplayer, notifications, friend invites, and asynchronous play.

Mobile becomes especially useful once the game supports:

- User accounts.
- Friends.
- Private rooms.
- Turn notifications.
- Asynchronous games.
- Daily puzzles.
- Cosmetic unlocks.
- Offline tutorials.

The website should be built in a way that avoids rewriting everything later.

---

# 2. Recommended Technical Direction

## 2.1 Overall Architecture

Use a shared TypeScript monorepo.

Recommended structure:

```text
shapes/
├── apps/
│   ├── web/
│   │   └── Website app
│   └── mobile/
│       └── Future iOS/Android app
├── packages/
│   ├── game-engine/
│   │   └── Pure Shapes rules and state transitions
│   ├── shared-types/
│   │   └── Shared TypeScript types
│   ├── ui/
│   │   └── Shared UI primitives where possible
│   └── assets/
│       └── Icons, card art, patterns, sounds
├── docs/
│   └── Rules, implementation notes, API notes
└── tests/
    └── Integration and simulation tests
```

The most important package is:

```text
packages/game-engine
```

This package should contain no React code, no database calls, and no browser-specific logic.

It should only know about:

- Cards
- Players
- Hands
- Clues
- Decks
- Discards
- Blueprints
- Turns
- Legal actions
- Scoring
- Win/loss conditions

This makes the game portable.

---

# 3. Recommended Stack

## 3.1 Language

Use **TypeScript**.

Reasons:

- Shared web and mobile logic.
- Strong typing for game state.
- Easier refactoring.
- Safer multiplayer event handling.
- Good compatibility with React, Next.js, Expo, Supabase, Firebase, and Node.js.

## 3.2 Website Frontend

Recommended:

- **Next.js**
- **React**
- **TypeScript**
- Tailwind CSS
- Zustand or Jotai for local UI state
- React Query or similar for server state

Next.js is suitable because it supports full-stack React web development, routing, server rendering, API routes/server functions, and deployment-friendly architecture.

## 3.3 Mobile App

Recommended:

- **Expo**
- **React Native**
- **TypeScript**

Expo is a good mobile target because it supports building Android, iOS, and web apps from a React Native codebase. The mobile app can reuse:

- Game engine
- Shared types
- Card assets
- Some UI logic
- API client
- Authentication flow
- Multiplayer state model

The mobile UI will still need to be redesigned for touch screens, smaller displays, and platform conventions.

## 3.4 Backend

Recommended backend options:

### Option A: Supabase

Use Supabase if you want:

- Postgres database
- Authentication
- Realtime subscriptions
- Row-level security
- SQL flexibility
- Easier data inspection

Good for:

- Multiplayer rooms
- Game history
- Accounts
- Friend lists
- Public/private lobbies
- Analytics tables
- Admin dashboards

### Option B: Firebase

Use Firebase if you want:

- Very fast realtime prototyping
- Firestore realtime sync
- Strong mobile SDK support
- Offline persistence features
- Push notification ecosystem

Good for:

- Mobile-first development
- Asynchronous turn-based games
- Offline-friendly client behavior
- Fast multiplayer prototypes

### Recommended choice for Shapes

Use **Supabase** if you want SQL control and a clean relational model.

Use **Firebase** if you want the easiest realtime mobile-first implementation.

For this project, I recommend:

> **Supabase for the main backend**, plus a separate realtime event channel for active games.

The game state is structured and relational enough that Postgres is useful. Supabase also gives you authentication, database storage, and realtime infrastructure in one place.

---

# 4. Core Development Principle

## 4.1 The Game Engine Must Be Pure

The game engine should be deterministic.

That means this function:

```ts
applyAction(gameState, action)
```

should always return the same result when given the same input.

Example:

```ts
const nextState = applyAction(currentState, {
  type: "PLAY_CARD",
  playerId: "player_2",
  cardIndex: 1
});
```

It should not:

- Read from the database.
- Write to the database.
- Call APIs.
- Generate UI.
- Depend on browser state.
- Depend on mobile APIs.
- Mutate global variables.

It should:

- Validate the action.
- Apply the action.
- Return the next game state.
- Return public/private views.
- Return generated events.

## 4.2 Why This Matters

A pure engine lets you:

- Test rules automatically.
- Prevent illegal moves.
- Reuse the same logic on web and mobile.
- Replay games from logs.
- Debug multiplayer desyncs.
- Build bots later.
- Build tutorials later.
- Build simulations for balancing.

---

# 5. Product Phases

# Phase 0 — Rules Lock and Technical Prototype

## Goal

Convert the tabletop rules into a precise digital specification.

## Deliverables

- Final digital rules document.
- Complete card list.
- Complete action list.
- Complete scoring rules.
- Game state schema.
- Pure game engine prototype.
- Unit tests for core rules.

## Key Questions

Before coding the full product, decide:

- Are patterns part of the base game or advanced game?
- Are objective cards included in version 1?
- Is Focus included or reserved as a variant?
- How strict are communication rules in digital form?
- Is the first release synchronous only?
- Will the game support spectators?
- Will the game support bots?

## Recommended Version 1 Rules

For digital version 1, use:

- 5 shape families.
- Ranks 1–5.
- Pattern attribute.
- Shape clues.
- Rank clues.
- Pattern clues.
- 8 Insight tokens.
- 3 Crack tokens.
- 2 public Blueprint Objective cards.
- No Focus action.
- Synchronous multiplayer only.
- 2–5 players.
- Score up to 25 plus objective bonuses.

Do not include too many variants in the first implementation.

## Phase 0 Tasks

```text
[ ] Define Card type
[ ] Define Deck type
[ ] Define Player type
[ ] Define GameState type
[ ] Define Action type
[ ] Define TurnState type
[ ] Define ObjectiveCard type
[ ] Define scoring model
[ ] Define legal clue validation
[ ] Define play validation
[ ] Define discard rules
[ ] Define endgame rules
[ ] Define final scoring
[ ] Write unit tests
[ ] Simulate 100 random games to catch crashes
```

---

# Phase 1 — Local Web Prototype

## Goal

Build a working browser prototype on one device.

This version does not need accounts, database, or networking. It is a hot-seat version where all players share one screen.

## Why This Phase Matters

This is the fastest way to validate:

- Card layout.
- Turn flow.
- Action buttons.
- Clue UI.
- Blueprint display.
- Discard visibility.
- Scoring.
- Basic fun factor.

## Features

- Start new game.
- Select player count.
- Deal cards.
- Show all hands.
- Hide current player’s own card information if using local test mode.
- Give shape/rank/pattern clue.
- Play card.
- Discard card.
- Draw card.
- Show Insight tokens.
- Show Crack tokens.
- Show blueprints.
- Show discard pile.
- End game and score.

## Important UI Problem

In a physical hidden-hand game, players can see other hands but not their own.

On one shared screen, this is difficult.

For the local prototype, use one of these solutions:

### Option A: Debug Mode

Show everything.

This is best for development but not real play.

### Option B: Pass-and-Play Mode

When it is your turn, the screen hides your own card identities and shows everyone else’s.

This is playable but awkward.

### Option C: Multi-device Web from the Start

Each player opens the same room link on their own device.

This is more realistic but requires networking.

## Recommended Choice

Use **Debug Mode** for Phase 1.

The goal is not real play yet. The goal is to prove the rules engine and UI.

## Phase 1 Tasks

```text
[ ] Create Next.js app
[ ] Create game-engine package
[ ] Create card renderer
[ ] Create blueprint renderer
[ ] Create player hand renderer
[ ] Create clue action modal
[ ] Create play action
[ ] Create discard action
[ ] Create draw flow
[ ] Create discard pile view
[ ] Create score view
[ ] Add debug state inspector
[ ] Add reset game button
[ ] Add basic responsive layout
```

## Exit Criteria

Phase 1 is complete when:

- A full game can be played locally.
- The game does not crash.
- All legal actions work.
- Illegal actions are blocked.
- Final score is computed correctly.
- The UI is understandable without developer explanation.

---

# Phase 2 — Multiplayer Web Prototype

## Goal

Build a real multiplayer web version where each player uses their own browser.

## Core Features

- Create room.
- Join room by code or link.
- Choose display name.
- See lobby.
- Start game.
- Each player sees other players’ cards.
- Each player cannot see their own card identities.
- Only current player can act.
- All players see updates in realtime.
- Game ends correctly.
- Players can return if they refresh.

## Room Flow

Recommended flow:

```text
1. Host clicks "Create Game"
2. Website creates room code
3. Host shares link
4. Other players join
5. Players choose names
6. Host starts game
7. Game is dealt server-side
8. Players play until game ends
9. Final score screen appears
```

## Room Code

Use short human-readable room codes.

Example:

```text
CIRCLE-8K
STAR-42
HEX-917
```

Avoid long UUIDs in the user-facing interface.

## Multiplayer State Model

There are two possible approaches.

---

## Approach A: Store Full Game State

The backend stores the current full game state after every action.

Pros:

- Easy to implement.
- Easy to load current game.
- Easy to display.
- Good for early prototype.

Cons:

- Harder to audit.
- Harder to replay.
- Riskier if bugs corrupt state.

---

## Approach B: Store Event Log

The backend stores the initial seed and every action.

The current game state is reconstructed by replaying actions.

Pros:

- Excellent for debugging.
- Easy to replay games.
- Good for cheat detection.
- Good for analytics.
- Good for future bots and tutorials.

Cons:

- More work.
- Requires deterministic engine.
- Requires migration care if rules change.

---

## Recommended Approach

Use a hybrid model:

```text
rooms
room_players
game_snapshots
game_events
```

Store:

- Current snapshot for fast loading.
- Event log for replay/debugging.

This gives the benefits of both approaches.

## Phase 2 Tasks

```text
[ ] Create backend project
[ ] Implement anonymous or guest auth
[ ] Create room table
[ ] Create room_players table
[ ] Create game_events table
[ ] Create game_snapshots table
[ ] Create create-room API
[ ] Create join-room API
[ ] Create start-game API
[ ] Create submit-action API
[ ] Validate actions server-side
[ ] Broadcast state updates
[ ] Build lobby UI
[ ] Build room link sharing
[ ] Build reconnect flow
[ ] Build player-specific private views
[ ] Add server-side action locking
[ ] Add game event history panel for debugging
```

## Exit Criteria

Phase 2 is complete when:

- 2–5 players can join from separate devices.
- Each player sees the correct hidden/private view.
- Turns update in realtime.
- Illegal actions are rejected server-side.
- Refreshing does not break the game.
- One complete multiplayer game can be played.

---

# Phase 3 — Playable Public Web Alpha

## Goal

Make the website good enough for external testers.

This is not a commercial launch. It is a controlled alpha.

## Features

- Landing page.
- Rules page.
- Create game.
- Join game.
- Room lobby.
- Game screen.
- End game screen.
- Basic mobile web responsiveness.
- Feedback button.
- Bug report form.
- Simple analytics.
- Game logs for debugging.

## User Experience Requirements

The website should answer these questions clearly:

- What is this game?
- How do I start?
- How do I invite friends?
- What can I do on my turn?
- Why is an action illegal?
- What does this clue mean?
- How close are we to losing?
- What is our score?

## Alpha Scope

Include:

- Guest play.
- Private rooms.
- 2–5 players.
- Standard rules.
- Basic objective cards.
- Basic scoring.

Exclude:

- Public matchmaking.
- Ranked play.
- Cosmetics.
- Chat.
- App accounts.
- App store builds.
- Push notifications.
- Monetization.
- Complex tutorials.

## Feedback Collection

Add structured feedback after every game:

```text
How clear were the rules? 1–5
How easy was the interface? 1–5
How fun was the game? 1–5
Would you play again? Yes/No
What confused you?
What felt unfair?
What should be improved?
```

## Analytics Events

Track:

```text
room_created
player_joined
game_started
game_completed
game_abandoned
action_submitted
illegal_action_attempted
clue_given
card_played
card_discarded
crack_received
objective_completed
final_score
```

## Phase 3 Tasks

```text
[ ] Build landing page
[ ] Build rules page
[ ] Build interactive tutorial overlay
[ ] Build feedback form
[ ] Add analytics events
[ ] Add game abandonment tracking
[ ] Add admin game log viewer
[ ] Add mobile responsive layout
[ ] Add loading and reconnect states
[ ] Add error messages
[ ] Add basic sound toggle
[ ] Add accessibility pass
```

## Exit Criteria

Phase 3 is complete when:

- People outside the development team can start and finish a game.
- Most testers understand the rules after one game.
- The game works on desktop and mobile browsers.
- Bugs can be diagnosed from logs.
- Feedback is being collected consistently.

---

# Phase 4 — Web Beta

## Goal

Move from prototype to durable product.

## Features

- User accounts.
- Persistent usernames.
- Friend invites.
- Game history.
- Rematch button.
- Saved statistics.
- Better tutorial.
- Better rules reference.
- Improved visual design.
- Basic moderation tools.
- Better reconnection behavior.
- Support for abandoned games.
- Optional bots for missing players.

## Accounts

Start with lightweight accounts:

- Email magic link
- Google sign-in
- Apple sign-in later for mobile

Allow guest play, but encourage accounts after a successful game.

## Game History

Users should be able to see:

- Games played
- Final scores
- Perfect games
- Average score
- Favorite shape family
- Most common clue type
- Failed plays
- Objective completion rate

## Rematch Flow

After a game ends, show:

```text
Final Score: 22
Result: Geometric Masterwork

[Play Again]
[Change Objectives]
[Invite New Players]
[Back to Home]
```

## Phase 4 Tasks

```text
[ ] Add account system
[ ] Add profile table
[ ] Add persistent display names
[ ] Add game history
[ ] Add rematch flow
[ ] Add player stats
[ ] Add friend invite links
[ ] Add improved tutorial
[ ] Add improved card art
[ ] Add production error monitoring
[ ] Add database backups
[ ] Add privacy policy
[ ] Add terms page
```

## Exit Criteria

Phase 4 is complete when:

- The website feels like a real product.
- Players can return and see their history.
- The UI is polished enough to show publicly.
- The backend can handle repeated play.
- There is a clear path to mobile.

---

# Phase 5 — Mobile Preparation

## Goal

Prepare the architecture for iOS and Android without fully building the app yet.

## Main Principle

Do not start mobile by copying the website screen-for-screen.

Mobile needs a different interface.

The phone screen should focus on:

- Current turn.
- Your hand.
- Other players’ hands.
- Blueprint progress.
- Available actions.
- Token status.

## Shared Code Audit

Before mobile development, identify what can be shared.

### Share Fully

```text
game-engine
shared-types
deck generation
action validation
scoring
objective card definitions
API client
auth helpers
analytics event names
asset files
```

### Share Partially

```text
card visual components
rules text
tutorial content
state management patterns
theme tokens
sound effects
```

### Do Not Share Directly

```text
desktop layout
large-table blueprint view
hover interactions
keyboard shortcuts
web-specific modals
browser-only APIs
```

## Phase 5 Tasks

```text
[ ] Extract all game logic into package
[ ] Extract shared TypeScript types
[ ] Extract API client
[ ] Extract objective definitions
[ ] Extract scoring definitions
[ ] Extract card asset library
[ ] Define mobile navigation map
[ ] Create mobile wireframes
[ ] Define push notification needs
[ ] Define app account requirements
[ ] Define offline behavior
```

## Exit Criteria

Phase 5 is complete when:

- The web app does not contain hidden game rules inside UI code.
- The mobile app can import the engine package.
- The API is documented.
- Mobile screens are designed.
- The backend supports mobile clients.

---

# Phase 6 — Mobile MVP

## Goal

Build the first phone app.

## Recommended Mobile Stack

Use:

- Expo
- React Native
- TypeScript
- Shared game-engine package
- Shared backend
- Shared auth
- Shared assets where possible

## Mobile MVP Features

Include:

- Login or guest play.
- Create room.
- Join room by code/link.
- Lobby.
- Live game screen.
- Give clue.
- Play card.
- Discard card.
- End game screen.
- Reconnect support.
- Basic settings.
- Basic tutorial.

Exclude initially:

- Push notifications.
- Public matchmaking.
- Ranked mode.
- Cosmetics.
- Offline solo mode.
- In-app purchases.

## Mobile Navigation

Recommended screens:

```text
Home
Create Game
Join Game
Lobby
Game
Rules
Profile
Settings
Game Summary
```

## Mobile Game Screen Layout

The mobile screen should be organized around a compressed table view.

Recommended layout:

```text
┌─────────────────────────┐
│ Tokens / Current Turn   │
├─────────────────────────┤
│ Blueprint Progress      │
├─────────────────────────┤
│ Other Player Hands      │
├─────────────────────────┤
│ Your Hidden Hand        │
├─────────────────────────┤
│ Action Buttons          │
└─────────────────────────┘
```

## Action Buttons

When it is your turn:

```text
[Give Insight]
[Play Card]
[Discard Card]
```

When it is not your turn:

```text
Waiting for Ana...
```

## Clue UX

Giving a clue on mobile must be very clear.

Flow:

```text
1. Tap Give Insight
2. Select player
3. Select clue type: Shape / Rank / Pattern
4. Select clue value
5. App highlights all matching cards
6. Confirm clue
```

This avoids invalid partial clues.

## Play UX

Flow:

```text
1. Tap one of your hidden cards
2. Tap Play
3. Confirmation appears
4. Submit action
5. Result animation plays
```

For expert mode, the confirmation can be disabled in settings.

## Discard UX

Flow:

```text
1. Tap one of your hidden cards
2. Tap Discard
3. Confirmation appears
4. Submit action
5. Insight token is recovered
```

## Phase 6 Tasks

```text
[ ] Create Expo app
[ ] Connect shared game-engine package
[ ] Connect shared API client
[ ] Implement auth
[ ] Implement home screen
[ ] Implement create room
[ ] Implement join room
[ ] Implement lobby
[ ] Implement game screen
[ ] Implement clue flow
[ ] Implement play flow
[ ] Implement discard flow
[ ] Implement end game screen
[ ] Implement reconnect flow
[ ] Test on iOS simulator
[ ] Test on Android emulator
[ ] Test on real phones
```

## Exit Criteria

Phase 6 is complete when:

- A complete game can be played from phones.
- Phones and web players can join the same room.
- The app handles refresh/reconnect equivalents.
- The UI is usable on small screens.
- The game state remains consistent across clients.

---

# Phase 7 — Mobile Beta

## Goal

Make the mobile version good enough for external testing through TestFlight and Android internal testing.

## Features

- Push notifications for asynchronous games.
- App deep links for room invites.
- Better onboarding.
- Better touch animations.
- Haptic feedback.
- Bug reporting.
- Crash reporting.
- App settings.
- Terms and privacy screens.
- App icon.
- Splash screen.
- Store screenshots.

## Push Notification Use Cases

Push notifications should support:

- It is your turn.
- Friend invited you to a game.
- Game completed.
- Player rejoined.
- Daily puzzle available.

Do not add push notifications before the core game is stable.

## App Store Preparation

You will need:

- App name.
- App icon.
- Short description.
- Long description.
- Screenshots.
- Privacy policy.
- Support URL.
- Age rating information.
- Test accounts if required.
- Clear explanation of multiplayer features.

## Phase 7 Tasks

```text
[ ] Add push notification permissions
[ ] Add notification server logic
[ ] Add deep links
[ ] Add TestFlight build
[ ] Add Android internal test build
[ ] Add crash reporting
[ ] Add app icon
[ ] Add splash screen
[ ] Add store screenshots
[ ] Add mobile privacy copy
[ ] Add beta tester feedback form
```

## Exit Criteria

Phase 7 is complete when:

- External testers can install the app.
- Invites open the correct room.
- Notifications work reliably.
- Crashes are visible to the development team.
- Mobile retention can be measured.

---

# Phase 8 — Launch Candidate

## Goal

Prepare for public release.

## Required Features

- Stable web app.
- Stable iOS app.
- Stable Android app.
- Cross-platform rooms.
- Accounts.
- Guest play.
- Rules tutorial.
- Reconnect handling.
- Basic moderation.
- Error monitoring.
- Privacy policy.
- Terms of service.
- Support contact.
- Production database backups.
- Admin tools.

## Launch Checklist

```text
[ ] Production backend configured
[ ] Production database backups enabled
[ ] Error monitoring active
[ ] Analytics active
[ ] Privacy policy published
[ ] Terms published
[ ] Support email created
[ ] App store metadata complete
[ ] Screenshots complete
[ ] App icon complete
[ ] Tutorial complete
[ ] Moderation plan written
[ ] Load test completed
[ ] Security rules reviewed
[ ] Authentication tested
[ ] Reconnect tested
[ ] Invite links tested
[ ] Payment disabled unless fully ready
```

## Soft Launch

Do not launch globally immediately.

Recommended order:

```text
1. Private alpha
2. Public web beta
3. TestFlight / Android closed beta
4. Soft launch in one or two regions
5. Full launch
```

---

# 6. Data Model

This section describes a possible backend data model.

## 6.1 Users

```text
users
- id
- display_name
- avatar_url
- created_at
- last_seen_at
```

## 6.2 Rooms

```text
rooms
- id
- room_code
- host_user_id
- status
- max_players
- ruleset_version
- created_at
- started_at
- completed_at
```

Possible statuses:

```text
lobby
active
completed
abandoned
cancelled
```

## 6.3 Room Players

```text
room_players
- id
- room_id
- user_id
- seat_index
- display_name
- connection_status
- joined_at
- left_at
```

Possible connection statuses:

```text
connected
disconnected
left
kicked
```

## 6.4 Game Snapshots

```text
game_snapshots
- id
- room_id
- version
- state_json
- public_state_json
- created_at
```

## 6.5 Game Events

```text
game_events
- id
- room_id
- sequence_number
- player_id
- action_type
- action_json
- resulting_state_hash
- created_at
```

## 6.6 Feedback

```text
feedback
- id
- user_id
- room_id
- clarity_rating
- interface_rating
- fun_rating
- would_play_again
- confusion_text
- unfair_text
- improvement_text
- created_at
```

## 6.7 Game Statistics

```text
game_stats
- id
- room_id
- player_count
- final_score
- crack_count
- insight_count_remaining
- turns_taken
- clues_given
- cards_played
- cards_discarded
- failed_plays
- completed_blueprints
- objectives_completed
- created_at
```

---

# 7. Game Engine Design

## 7.1 Main Types

```ts
type ShapeFamily =
  | "circle"
  | "triangle"
  | "square"
  | "star"
  | "hexagon";

type Pattern =
  | "solid"
  | "striped"
  | "dotted"
  | "hollow"
  | "radiant";

type Rank = 1 | 2 | 3 | 4 | 5;

type Card = {
  id: string;
  shape: ShapeFamily;
  rank: Rank;
  pattern: Pattern;
};

type Player = {
  id: string;
  name: string;
  hand: Card[];
};

type BlueprintState = {
  shape: ShapeFamily;
  cards: Card[];
};

type GameState = {
  id: string;
  rulesetVersion: string;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  blueprints: Record<ShapeFamily, BlueprintState>;
  insightTokens: number;
  crackTokens: number;
  currentPlayerIndex: number;
  status: "lobby" | "active" | "completed" | "failed";
  finalRoundStartedByPlayerId?: string;
  remainingFinalTurns?: number;
  objectiveCards: ObjectiveCard[];
  turnNumber: number;
};
```

## 7.2 Actions

```ts
type GameAction =
  | GiveInsightAction
  | PlayCardAction
  | DiscardCardAction;

type GiveInsightAction = {
  type: "GIVE_INSIGHT";
  fromPlayerId: string;
  toPlayerId: string;
  clueType: "shape" | "rank" | "pattern";
  clueValue: string | number;
};

type PlayCardAction = {
  type: "PLAY_CARD";
  playerId: string;
  cardIndex: number;
};

type DiscardCardAction = {
  type: "DISCARD_CARD";
  playerId: string;
  cardIndex: number;
};
```

## 7.3 Engine Functions

```ts
createGame(config): GameState

shuffleDeck(seed): Card[]

getPublicView(gameState, viewerPlayerId): PublicGameState

getLegalActions(gameState, playerId): LegalAction[]

validateAction(gameState, action): ValidationResult

applyAction(gameState, action): ApplyActionResult

scoreGame(gameState): ScoreResult

checkEndgame(gameState): EndgameResult
```

## 7.4 Important Rule Validation

The engine must validate:

- It is the acting player’s turn.
- The game is active.
- The player exists.
- The selected card exists.
- Insight tokens are available for clues.
- Clue target is another player.
- Clue value exists in the target player’s hand.
- Clue identifies all matching cards.
- Card play is legal or correctly fails.
- Discard recovers no more than the maximum Insight count.
- Final round is triggered correctly.
- Game ends after final turns.
- Scoring matches the rulebook.

---

# 8. Private and Public Views

## 8.1 Why Views Matter

Each player must see a different version of the game.

A player should see:

- Other players’ full cards.
- Their own card backs or clue markers.
- Public blueprints.
- Discard pile.
- Tokens.
- Current turn.
- Objective cards.

A player should not see:

- Their own hidden card identities.
- The remaining deck order.
- Hidden internal randomness.

## 8.2 Public View Function

Use a function like:

```ts
getPlayerView(gameState, viewerPlayerId)
```

For the viewer’s own hand, return:

```ts
{
  cardId: "hidden_1",
  knownShape: null,
  knownRank: null,
  knownPattern: null,
  clueHistory: []
}
```

For other players’ hands, return full card data.

## 8.3 Clue History

The digital version should track formal clues.

Example:

```ts
type ClueRecord = {
  turnNumber: number;
  clueType: "shape" | "rank" | "pattern";
  clueValue: string | number;
  cardIndexes: number[];
};
```

This is helpful because players may forget clues.

## 8.4 Should Clue History Be Visible?

Recommended:

- Show clue markers on cards.
- Allow players to open clue history.
- Do not automatically infer hidden card identities for the player.

For example, if a player has received:

```text
This card is a Triangle.
This card is Striped.
```

The app may show:

```text
Known: Triangle, Striped
```

But it should not reveal:

```text
This is Triangle 3
```

unless rank was also clued.

---

# 9. Website User Interface Plan

## 9.1 Landing Page

Sections:

```text
Hero
How It Works
Create Game
Join Game
Rules Summary
Development Status
Feedback Link
```

Hero copy:

```text
Shapes is a cooperative hidden-hand deduction game where players assemble geometric blueprints using limited clues.
```

Buttons:

```text
[Create Game]
[Join with Code]
[Read Rules]
```

## 9.2 Lobby Page

Show:

- Room code.
- Invite link.
- Player list.
- Host controls.
- Ruleset summary.
- Start button.

Example:

```text
Room: HEX-42

Players:
1. Luis
2. Ana
3. Marco

Rules:
Standard Mode
8 Insight tokens
3 Crack tokens
2 Objective cards

[Copy Invite Link]
[Start Game]
```

## 9.3 Game Page

Desktop layout:

```text
┌──────────────────────────────────────────────┐
│ Room / Turn / Tokens                         │
├──────────────────────┬───────────────────────┤
│ Other Player Hands   │ Blueprints            │
│                      │ Discard Pile           │
├──────────────────────┴───────────────────────┤
│ Your Hand                                     │
├──────────────────────────────────────────────┤
│ Action Panel                                  │
└──────────────────────────────────────────────┘
```

## 9.4 Action Panel

When it is your turn:

```text
Choose an action:

[Give Insight]
[Play Card]
[Discard Card]
```

When it is not your turn:

```text
Waiting for Ana to act...
```

## 9.5 Blueprint Display

Show each shape as a row:

```text
Circle:   1 2 _ _ _
Triangle: 1 2 3 _ _
Square:   1 _ _ _ _
Star:     _ _ _ _ _
Hexagon:  1 2 3 4 _
```

Use shape icons and card miniatures instead of text in the final UI.

## 9.6 Discard Pile

The discard pile should be filterable by:

- Shape
- Rank
- Pattern

This is important because players need to know which cards are still possible.

## 9.7 Objective Cards

Display objectives clearly.

Example:

```text
Perfect Symmetry
Score +3 if at least three shape families reach rank 5.
```

Show progress where possible:

```text
Progress: 1 / 3 completed families
```

---

# 10. Mobile User Interface Plan

## 10.1 Mobile Home

Show:

```text
Shapes
[Create Game]
[Join Game]
[How to Play]
[Profile]
```

## 10.2 Mobile Game Layout

A phone cannot show everything at once, so use collapsible sections.

Recommended order:

```text
Top: current turn and tokens
Middle: blueprint progress
Tabs: players / discard / objectives
Bottom: your hand and actions
```

## 10.3 Mobile Turn Controls

Use a bottom action sheet.

```text
It is your turn.

[Give Insight]
[Play Card]
[Discard Card]
```

## 10.4 Card Selection

Cards should be large enough to tap safely.

Recommended minimum touch target:

```text
44px × 44px
```

Each card should have:

- Shape icon.
- Rank.
- Pattern.
- Clue markers.
- Selection state.

## 10.5 Other Players’ Hands

Use horizontal scroll rows:

```text
Ana
[Circle 1] [Star 4] [Triangle 3] [Square 2]

Marco
[Hexagon 5] [Circle 2] [Square 1] [Star 1]
```

## 10.6 Your Hand

Your cards appear as backs with clue markers:

```text
You
[Triangle ?] [? 4] [Striped ?] [? ?]
```

The app should help players remember formal clue information without revealing unclued hidden data.

---

# 11. Multiplayer and Synchronization

## 11.1 Server Authority

The server should be authoritative.

Clients may propose actions, but the server validates and applies them.

Flow:

```text
Client submits action
Server loads current state
Server validates action
Server applies action
Server stores event
Server stores snapshot
Server broadcasts update
Clients render new state
```

This prevents cheating and state desynchronization.

## 11.2 Action Locking

Only one action should be processed at a time per room.

Use:

- Database transaction
- Room version number
- Optimistic concurrency
- Server-side lock

Recommended pattern:

```text
action includes expected_state_version
server rejects action if version is stale
client refreshes state
```

## 11.3 Reconnection

When a player reconnects:

```text
1. Client requests current room state
2. Server returns player-specific view
3. Client resumes from latest version
4. Realtime subscription restarts
```

## 11.4 Disconnection

If a player disconnects, do not immediately end the game.

Show:

```text
Ana disconnected.
Waiting for reconnect...
```

Options:

- Pause timer if using timers.
- Allow host to remove player in lobby only.
- For active games, allow waiting or replacing with bot later.

---

# 12. Synchronous vs Asynchronous Play

## 12.1 First Release

Start with synchronous play only.

This means all players are expected to be online at the same time.

## 12.2 Later Release

Add asynchronous play later.

Asynchronous play requires:

- Push notifications.
- Longer turn timers.
- Game reminders.
- Better clue history.
- Stronger state persistence.
- Abandoned game handling.
- Possibly chat restrictions.

## 12.3 Why Not Start Async?

Asynchronous hidden-hand deduction is harder because players forget context.

The app must compensate with:

- Clue history.
- Turn summaries.
- Discard summaries.
- Objective progress.
- Replay log.

Build synchronous first.

---

# 13. Tutorial Plan

## 13.1 Tutorial Goals

Teach:

- You cannot see your own cards.
- You can see other players’ cards.
- You spend Insight tokens to clue.
- Clues must identify all matching cards.
- You build shapes from 1 to 5.
- Bad plays create Cracks.
- Discards recover Insight.
- The deck running out starts the final round.

## 13.2 Tutorial Format

Use an interactive tutorial rather than a long rulebook.

Example sequence:

```text
Step 1: Look at another player's hand.
Step 2: Give a clue.
Step 3: Watch how clue markers appear.
Step 4: Play a known safe card.
Step 5: Discard to recover Insight.
Step 6: Complete a blueprint.
Step 7: Score the game.
```

## 13.3 Tutorial Bot

For the web beta, create a scripted bot tutorial.

The bot does not need to be intelligent. It only needs to follow a scripted sequence.

---

# 14. Bots

## 14.1 Why Add Bots Later?

Bots are useful for:

- Tutorials.
- Replacing disconnected players.
- Solo practice.
- Testing.
- Simulations.

## 14.2 Bot Complexity Levels

### Scripted Bot

Follows predefined tutorial actions.

### Rule-Based Bot

Uses simple heuristics:

- Play if card is known playable.
- Discard if known safe.
- Clue playable cards.
- Avoid discarding rank 5.

### Simulation Bot

Runs possible game states and chooses statistically strong actions.

Do not build advanced bots early.

## 14.3 Bot Phase Recommendation

Add bots after the web beta, not before.

---

# 15. Testing Strategy

## 15.1 Unit Tests

Test the game engine heavily.

Examples:

```text
[ ] Cannot clue with zero Insight tokens
[ ] Shape clue identifies all matching shapes
[ ] Rank clue identifies all matching ranks
[ ] Pattern clue identifies all matching patterns
[ ] Playing correct next rank succeeds
[ ] Playing wrong rank fails
[ ] Failed play adds Crack
[ ] Third Crack ends game
[ ] Discard recovers Insight
[ ] Insight cannot exceed maximum
[ ] Completing rank 5 recovers Insight
[ ] Deck empty triggers final round
[ ] Final scoring is correct
```

## 15.2 Integration Tests

Test full flows:

```text
[ ] Create room
[ ] Join room
[ ] Start game
[ ] Give clue
[ ] Play card
[ ] Discard card
[ ] Complete game
[ ] Reconnect to game
[ ] Reject stale action
```

## 15.3 Simulation Tests

Run thousands of random legal actions to catch crashes.

```text
for each seed:
  create game
  while game active:
    choose random legal action
    apply action
  assert valid terminal state
```

Simulation testing is especially valuable for card games.

## 15.4 Manual Playtests

Track:

- Confusing UI moments.
- Misclicks.
- Misunderstood clues.
- Slow turns.
- Dead time.
- Score distribution.
- Player enjoyment.
- Whether players want to replay.

---

# 16. Accessibility

## 16.1 Visual Accessibility

Do not rely on color alone.

Every card must communicate through:

- Shape
- Number
- Pattern
- Text label or icon

## 16.2 Interaction Accessibility

Support:

- Large tap targets.
- Keyboard navigation on web.
- Screen reader labels.
- Reduced motion setting.
- High contrast mode.
- Clear focus states.

## 16.3 Cognitive Accessibility

Add:

- Clue history.
- “Why is this illegal?” explanations.
- Rules reminders.
- Turn summary.
- Objective progress indicators.

---

# 17. Security and Fair Play

## 17.1 Hidden Information

The server must never send a player their own hidden card identities.

Do not rely only on UI hiding.

A cheating user should not be able to open developer tools and see their own cards.

## 17.2 Server-Side Validation

The server must validate every action.

Clients should not be trusted.

## 17.3 Room Privacy

Private rooms should use unguessable invite tokens or sufficiently random room codes.

Human-readable room codes are nice, but invite URLs should include a secure token if privacy matters.

## 17.4 Rate Limits

Add rate limits for:

- Creating rooms.
- Joining rooms.
- Submitting actions.
- Sending feedback.
- Login attempts.

---

# 18. Analytics and Product Metrics

## 18.1 Core Metrics

Track:

- Number of games started.
- Number of games completed.
- Completion rate.
- Average final score.
- Average game duration.
- Average number of turns.
- Average number of players.
- Return rate.
- Rematch rate.
- Tutorial completion rate.

## 18.2 Rule Balance Metrics

Track:

- Clues by type.
- Failed plays.
- Discards by rank.
- Rank 5 discarded.
- Objectives completed.
- Shape families completed.
- Crack count at end.
- Insight tokens at end.

## 18.3 UX Metrics

Track:

- Illegal action attempts.
- Reconnects.
- Rage quits or abandoned games.
- Time per turn.
- Mobile vs desktop completion rate.
- Feedback ratings.

---

# 19. Development Milestones

## Milestone 1: Rules Engine

Outcome:

```text
The game can run in code without UI.
```

Deliverables:

```text
[ ] Game types
[ ] Deck generation
[ ] Shuffle
[ ] Legal actions
[ ] Apply actions
[ ] Scoring
[ ] Tests
```

## Milestone 2: Local Web Prototype

Outcome:

```text
A developer can play a full local game in the browser.
```

Deliverables:

```text
[ ] Next.js app
[ ] Basic UI
[ ] Cards
[ ] Blueprints
[ ] Action buttons
[ ] Debug tools
```

## Milestone 3: Multiplayer Rooms

Outcome:

```text
Players can join the same room and see updates.
```

Deliverables:

```text
[ ] Backend room model
[ ] Create room
[ ] Join room
[ ] Realtime updates
[ ] Server-side validation
```

## Milestone 4: Public Web Alpha

Outcome:

```text
External testers can play and submit feedback.
```

Deliverables:

```text
[ ] Landing page
[ ] Rules page
[ ] Feedback form
[ ] Mobile web layout
[ ] Analytics
```

## Milestone 5: Web Beta

Outcome:

```text
The game feels like a usable product.
```

Deliverables:

```text
[ ] Accounts
[ ] Game history
[ ] Rematch
[ ] Tutorial
[ ] Improved art
```

## Milestone 6: Mobile MVP

Outcome:

```text
The game can be played on iOS and Android.
```

Deliverables:

```text
[ ] Expo app
[ ] Shared engine
[ ] Mobile game screen
[ ] Room invites
[ ] Reconnect handling
```

## Milestone 7: Mobile Beta

Outcome:

```text
External testers can install and test the app.
```

Deliverables:

```text
[ ] TestFlight
[ ] Android internal testing
[ ] Push notifications
[ ] Deep links
[ ] Crash reporting
```

## Milestone 8: Launch Candidate

Outcome:

```text
The game is ready for public release.
```

Deliverables:

```text
[ ] Production backend
[ ] Store assets
[ ] Privacy policy
[ ] Terms
[ ] Support process
[ ] Monitoring
```

---

# 20. Suggested MVP Scope

## Web MVP

The first true MVP should include:

```text
[ ] Create private room
[ ] Join private room
[ ] 2–5 players
[ ] Standard rules
[ ] Shape/rank/pattern clues
[ ] Play/discard
[ ] Realtime updates
[ ] Final scoring
[ ] Basic rules page
[ ] Feedback form
```

Do not include:

```text
[ ] Public matchmaking
[ ] User accounts
[ ] Ranked mode
[ ] Cosmetics
[ ] Chat
[ ] Push notifications
[ ] Bots
[ ] Mobile app
```

## Mobile MVP

The first mobile MVP should include:

```text
[ ] Same room system as web
[ ] Guest or account login
[ ] Join by link/code
[ ] Play full game
[ ] Reconnect
[ ] Basic tutorial
[ ] End game summary
```

Do not include:

```text
[ ] Ranked mode
[ ] Store purchases
[ ] Complex animations
[ ] Advanced bots
[ ] Public matchmaking
```

---

# 21. Risks and Mitigations

## Risk 1: The game feels too close to its inspiration

Mitigation:

- Emphasize pattern clues.
- Use Blueprint Objective cards.
- Use geometric theme deeply.
- Avoid similar terminology.
- Avoid similar visual structure.
- Add scoring objectives that change decisions.

## Risk 2: Multiplayer state desync

Mitigation:

- Server-authoritative actions.
- State versioning.
- Event logs.
- Deterministic engine.
- Reconnect flow.

## Risk 3: Players forget clues

Mitigation:

- Built-in clue markers.
- Clue history.
- Turn log.
- Tutorial reminders.

## Risk 4: Mobile screen is too crowded

Mitigation:

- Use collapsible sections.
- Use tabs for discard/objectives.
- Keep current action fixed at bottom.
- Use large card miniatures.
- Reduce nonessential information.

## Risk 5: Testers cannot organize enough players

Mitigation:

- Support 2-player mode well.
- Add tutorial bot later.
- Add async mode later.
- Add friend invite links.
- Add rematch flow.

## Risk 6: Backend costs grow

Mitigation:

- Store compact game snapshots.
- Archive completed games.
- Avoid excessive realtime broadcasts.
- Compress event logs if needed.
- Limit abandoned room lifetime.

---

# 22. Recommended Immediate Next Steps

## Step 1: Create the repository

Recommended structure:

```text
shapes/
├── apps/web
├── packages/game-engine
├── packages/shared-types
├── packages/assets
└── docs
```

## Step 2: Implement the game engine

Start with:

```text
createDeck()
shuffleDeck(seed)
createGame()
getLegalActions()
validateAction()
applyAction()
scoreGame()
```

## Step 3: Build a debug web UI

Show:

```text
Full hands
Deck count
Discards
Blueprints
Tokens
Current player
Action buttons
Game log
```

## Step 4: Playtest locally

Use debug mode to test rules before networking.

## Step 5: Add multiplayer rooms

Only after the local prototype feels stable.

---

# 23. Practical First Sprint

## Sprint Goal

Build a local browser prototype that can complete one full game.

## Sprint Tasks

```text
[ ] Initialize monorepo
[ ] Add TypeScript config
[ ] Create game-engine package
[ ] Define card types
[ ] Define game state
[ ] Implement deck generation
[ ] Implement seeded shuffle
[ ] Implement create game
[ ] Implement play card action
[ ] Implement discard action
[ ] Implement clue action
[ ] Implement scoring
[ ] Add unit tests
[ ] Create Next.js web app
[ ] Render hands
[ ] Render blueprints
[ ] Render tokens
[ ] Add action buttons
[ ] Add game log
[ ] Add reset button
```

## Sprint Output

At the end of the first sprint, you should be able to open the website locally and play a complete debug game.

---

# 24. Practical Second Sprint

## Sprint Goal

Turn the local prototype into a private multiplayer prototype.

## Sprint Tasks

```text
[ ] Create backend project
[ ] Create rooms table
[ ] Create room_players table
[ ] Create game_events table
[ ] Create game_snapshots table
[ ] Add create room endpoint
[ ] Add join room endpoint
[ ] Add start game endpoint
[ ] Add submit action endpoint
[ ] Add server-side action validation
[ ] Add realtime room subscription
[ ] Add lobby screen
[ ] Add room code sharing
[ ] Add player-specific views
[ ] Add reconnect on refresh
```

## Sprint Output

At the end of the second sprint, 2–5 people should be able to play from separate browsers.

---

# 25. Practical Third Sprint

## Sprint Goal

Prepare the web alpha for external playtesters.

## Sprint Tasks

```text
[ ] Improve game UI
[ ] Add rules page
[ ] Add tutorial overlay
[ ] Add feedback form
[ ] Add analytics events
[ ] Add mobile responsive layout
[ ] Add loading states
[ ] Add error handling
[ ] Add reconnect messaging
[ ] Add basic accessibility labels
[ ] Deploy to production URL
```

## Sprint Output

At the end of the third sprint, you should be able to send a link to testers.

---

# 26. Final Recommendation

Build **Shapes** in this order:

```text
1. Pure TypeScript game engine
2. Local debug website
3. Multiplayer website
4. Public web alpha
5. Web beta with accounts and history
6. Shared-code mobile app using Expo
7. Mobile beta
8. Public launch
```

The most important architectural decision is to keep the rules engine independent from the UI and backend. If you do that correctly, moving from website to phones will be much easier.
