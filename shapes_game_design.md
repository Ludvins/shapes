# Shapes

A detailed cooperative hidden-hand deduction card game design plan.

---

## Core Concept

**Shapes** is a cooperative card game where players work together to complete abstract geometric blueprints. Each player holds their cards facing away from themselves, so everyone can see everyone else’s cards except their own.

Players give limited clues, play cards into shared shape structures, or discard cards to recover clue resources. The goal is to complete as many geometric blueprints as possible before making too many construction errors.

The theme is not fireworks. The table represents a shared **design board**, and the players are collectively assembling a sequence of abstract forms.

---

# High-Level Identity

## Genre

Cooperative deduction / memory / hand-management card game.

## Player Count

**2–5 players**

Best at: **3–4 players**

## Play Time

**20–35 minutes**

## Age Range

**10+**

## Design Goals

The game should feel:

- Clean and abstract.
- More geometric than thematic.
- Cooperative but tense.
- Logical without becoming dry.
- Familiar enough to learn quickly, but mechanically distinct.

---

# Main Mechanical Difference from Hanabi

To make **Shapes** more original, I would not only replace colors with shapes. I would add a second visible attribute: **pattern**.

Each card has:

1. A **shape family**
2. A **rank**
3. A **pattern**

Players can give clues about either:

- Shape
- Rank
- Pattern

This creates a richer deduction space than simply color/number clues.

---

# Components

## Shape Cards

Recommended deck:

| Shape family | Ranks | Copies |
|---|---:|---:|
| Circle | 1–5 | variable |
| Triangle | 1–5 | variable |
| Square | 1–5 | variable |
| Star | 1–5 | variable |
| Hexagon | 1–5 | variable |

Use the classic distribution because it creates good tension:

| Rank | Copies per shape |
|---:|---:|
| 1 | 3 copies |
| 2 | 2 copies |
| 3 | 2 copies |
| 4 | 2 copies |
| 5 | 1 copy |

Total:

**5 shape families × 10 cards each = 50 cards**

---

## Pattern Attribute

Each card also has one of several patterns.

Example patterns:

- Solid
- Striped
- Dotted
- Hollow

Patterns should be distributed across the deck in a balanced but not perfectly predictable way.

A simple distribution:

| Rank | Pattern |
|---:|---|
| 1 | Solid / Striped / Dotted |
| 2 | Solid / Hollow |
| 3 | Striped / Dotted |
| 4 | Solid / Hollow |
| 5 | Unique pattern, such as Radiant |

The exact distribution can be adjusted during playtesting.

---

## Resource Tokens

Use two shared token tracks:

### Insight Tokens

These are spent to give clues.

Recommended count: **8 Insight tokens**

### Crack Tokens

These represent mistakes in the blueprint.

Recommended count: **3 Crack tokens**

After the third Crack, the game ends in failure or immediate scoring, depending on the mode.

---

## Blueprint Board

The shared play area has five build zones, one for each shape family:

- Circle Blueprint
- Triangle Blueprint
- Square Blueprint
- Star Blueprint
- Hexagon Blueprint

Each blueprint is built from rank **1 to 5**.

---

# Card Design

Each card should clearly show:

- Large central shape icon.
- Rank number in two corners.
- Pattern filling the shape.
- Optional small accessibility icon for the shape family.
- Optional text label for prototypes.

Example card:

```text
┌─────────────┐
│ 3       3   │
│             │
│   △ △ △     │
│  STRIPED    │
│             │
│ Triangle 3  │
└─────────────┘
```

For a polished version, avoid relying only on color. Use shape silhouettes, line patterns, and rank numbers.

---

# Setup

1. Shuffle all Shape cards.
2. Place the deck facedown.
3. Place 8 Insight tokens in the shared supply.
4. Place 3 Crack tokens nearby.
5. Create five empty blueprint zones, one for each shape family.
6. Deal hands:

| Players | Cards per player |
|---:|---:|
| 2–3 | 5 cards |
| 4–5 | 4 cards |

7. Players hold their cards facing outward, so they cannot see their own cards.

---

# Objective

Build each shape family from **1 to 5**.

A completed game has:

```text
Circle:   1 2 3 4 5
Triangle: 1 2 3 4 5
Square:   1 2 3 4 5
Star:     1 2 3 4 5
Hexagon:  1 2 3 4 5
```

Maximum score: **25**

---

# Turn Structure

On your turn, take exactly one of these actions:

1. Give an Insight.
2. Play a card.
3. Discard a card.
4. Optional advanced action: Focus.

For the base game, use only the first three.

---

# Action 1: Give an Insight

Spend 1 Insight token to give another player information about their hand.

You may give one of three clue types.

---

## Shape Clue

Point to all cards of one shape family in that player’s hand.

Example:

> “These two cards are Triangles.”

You must indicate **all** cards in their hand matching that shape.

---

## Rank Clue

Point to all cards of one rank in that player’s hand.

Example:

> “This card is a 4.”

Again, you must indicate all cards of that rank.

---

## Pattern Clue

Point to all cards of one pattern in that player’s hand.

Example:

> “These are Striped.”

You must indicate all cards of that pattern.

---

## Illegal Clues

You may not give partial clues.

For example, if a player has three Stars, you cannot point to only one and say:

> “This is a Star.”

You must identify all Stars in that hand.

You also may not give strategic commentary like:

> “This is useful.”  
> “You should play this.”  
> “This one is dangerous.”  
> “Remember what I told you earlier.”

The clue itself is the communication.

---

# Action 2: Play a Card

Choose one card from your own hand and play it to the table.

Since you cannot see your own cards, this is a deduction-based risk.

---

## Successful Play

A card is successful if it is the next needed rank in its shape family.

Example:

- Circle blueprint has Circle 1 and Circle 2.
- You play Circle 3.
- It is successful.

Place it on the Circle blueprint.

---

## Failed Play

A card fails if it cannot currently be placed.

Example:

- Square blueprint needs Square 2.
- You play Square 4.
- It fails.

Discard the card and add 1 Crack token.

If the team receives the third Crack token, the game ends.

---

## Bonus for Completing a Shape

When a shape family reaches rank 5, recover 1 Insight token, up to the maximum of 8.

This rewards completing full structures.

---

# Action 3: Discard a Card

Choose one card from your own hand and discard it.

Then recover 1 Insight token, up to the maximum of 8.

Discarding is necessary because Insight tokens are limited, but careless discarding can permanently lose essential cards, especially rank 5 cards.

---

# Drawing Cards

After you play or discard a card, draw one replacement card from the deck.

Do not look at it.

Add it to your hand facing outward.

If the deck is empty, do not draw.

---

# Endgame

When the deck runs out, each player gets **one final turn**, including the player who drew the last card.

After those turns, score the blueprints.

The score is the highest completed rank in each shape family added together.

Example:

| Shape | Completed up to | Points |
|---|---:|---:|
| Circle | 5 | 5 |
| Triangle | 4 | 4 |
| Square | 3 | 3 |
| Star | 5 | 5 |
| Hexagon | 2 | 2 |

Total score: **19**

---

# Scoring Table

| Score | Result |
|---:|---|
| 0–5 | Collapsed design |
| 6–10 | Rough sketch |
| 11–15 | Stable structure |
| 16–20 | Elegant design |
| 21–24 | Masterwork |
| 25 | Perfect geometry |

---

# Distinctive Mechanic: Pattern Pressure

This is the mechanic I would add to make **Shapes** meaningfully different.

## Concept

Patterns are not required to build the main blueprints, but they affect bonus scoring and special objectives.

At the end of the game, each completed shape family is checked for pattern harmony.

Example:

A blueprint gets a **Harmony bonus** if its five cards contain at least three different patterns.

Or:

A blueprint gets a bonus if no adjacent cards have the same pattern.

This creates deeper decisions:

- Should we play the safe Triangle 3 now?
- Or wait for a Triangle 3 with a better pattern?
- Is this card playable, but bad for the final design?

---

## Simple Version

For the base advanced game:

> At the end of the game, gain 1 bonus point for each completed shape family whose five cards contain at least three different patterns.

Maximum score becomes:

**25 base points + 5 Harmony points = 30**

Scoring table becomes:

| Score | Result |
|---:|---|
| 0–8 | Broken draft |
| 9–15 | Functional design |
| 16–22 | Refined composition |
| 23–27 | Geometric masterwork |
| 28–30 | Perfect symmetry |

---

# Alternative Distinctive Mechanic: Blueprint Cards

This is probably even stronger.

Instead of always building all five shapes from 1 to 5, each game uses public **Blueprint Objective cards**.

---

## Example Objectives

### Balanced Form

Score +2 if at least four shape families reach rank 3.

### Sharp Angles

Score +1 for each completed Triangle, Star, or Hexagon rank 4+.

### Circular Logic

Circle cards may be played one rank ahead, but they do not score until the missing rank is filled.

### Minimalist Design

Score +3 if you finish the game with zero Crack tokens.

### Pattern Study

Score +1 for each blueprint containing Solid, Striped, and Dotted cards.

---

## Recommended Use

At setup, reveal **2 Blueprint Objective cards**.

They give the team a slightly different strategic puzzle each game.

This helps **Shapes** feel less like a fixed-sequence copy and more like a modular cooperative puzzle.

---

# Recommended Final Version

I would combine both features:

1. **Core blueprints:** build each shape from 1 to 5.
2. **Pattern clues:** players can clue shape, rank, or pattern.
3. **Objective cards:** each game has 2 public scoring objectives.

That gives the game its own design identity while keeping it clean.

---

# Full Component List

## Required Components

- 50 Shape cards
- 8 Insight tokens
- 3 Crack tokens
- 10–20 Blueprint Objective cards
- 5 shape reference cards
- 1 rulebook

## Optional Components

- Player aid cards
- Pattern reference card
- Score pad
- First-player marker
- Card stands for accessibility

---

# Example Deck List

For each shape family:

| Card | Copies | Pattern examples |
|---|---:|---|
| Rank 1 | 3 | Solid, Striped, Dotted |
| Rank 2 | 2 | Solid, Hollow |
| Rank 3 | 2 | Striped, Dotted |
| Rank 4 | 2 | Solid, Hollow |
| Rank 5 | 1 | Radiant |

Repeat for:

- Circle
- Triangle
- Square
- Star
- Hexagon

Total: 50 cards.

---

# Example Turn

The Triangle blueprint currently has:

```text
Triangle 1, Triangle 2
```

Luis has four cards facing outward:

```text
Square 1, Triangle 3, Circle 5, Star 2
```

Luis cannot see these.

Another player spends 1 Insight and says:

> “This card is a Triangle.”

They point to the Triangle 3.

On Luis’s turn, he reasons:

- I was told this is a Triangle.
- Triangle currently needs 3.
- It may be safe to play.

Luis plays the card.

It is Triangle 3, so it is added to the Triangle blueprint.

Luis draws a replacement card facing outward.

---

# Communication Rules

This part is important because the game lives or dies by communication limits.

## Allowed Communication

Players may discuss:

- Current table state.
- Cards in the discard pile.
- Number of Insight tokens.
- Number of Crack tokens.
- General rules.
- Public objectives.

Players may not reveal hidden information except through formal Insights.

---

## Not Allowed

Players may not say:

- “I think you should play your second card.”
- “That card is important.”
- “Don’t discard that.”
- “Remember what I just told you.”
- “That clue means it is playable.”
- “I’m giving this clue because…”

---

## Table Convention Warning

Experienced groups may develop conventions. That is okay, but the rulebook should say:

> For the intended experience, clues should communicate only the literal information allowed by the rules.

---

# Advanced Action: Focus

This is optional, but I like it for **Shapes**.

## Focus Action

Once per turn, instead of giving an Insight, playing, or discarding, a player may take a **Focus** action:

> Spend 2 Insight tokens to ask one yes/no question about one of your own cards.

Examples:

- “Is this card currently playable?”
- “Is this card a rank 5?”
- “Is this card safe to discard?”
- “Is this card part of a public objective?”

Another player answers only:

> “Yes” or “No.”

---

## Why It Is Useful

This gives players a pressure-release valve when the board state becomes too opaque.

## Why It Might Be Dangerous

It can make the game easier and less elegant.

My recommendation:

- Do **not** include Focus in the base game.
- Include it as a beginner or family variant.

---

# Difficulty Modes

## Beginner Mode

- 9 Insight tokens.
- 4 Crack tokens.
- No pattern scoring.
- No objective cards.

## Standard Mode

- 8 Insight tokens.
- 3 Crack tokens.
- 2 Blueprint Objective cards.
- Pattern clues allowed.

## Expert Mode

- 7 Insight tokens.
- 3 Crack tokens.
- 3 Blueprint Objective cards.
- Pattern Harmony scoring active.

## Brutal Mode

- 7 Insight tokens.
- 2 Crack tokens.
- 3 Objective cards.
- No Insight recovery when completing a shape.

---

# 2-Player Mode

Two-player hidden-hand games can be fragile because there are fewer visible hands.

Recommended adjustment:

Each player has:

- A normal hand of 5 cards.
- A shared visible **draft row** of 3 cards.

On your turn, you may play or discard from:

- Your own hidden hand, or
- The shared draft row.

Cards in the draft row are visible to both players and replenished after use.

This creates more tactical control and makes the 2-player version less swingy.

---

# 5-Player Mode

At 5 players, downtime and memory load increase.

Recommended adjustment:

- 4 cards per player.
- Standard 8 Insight tokens.
- Consider removing pattern Harmony scoring for first plays.

---

# Prototype Rules Summary

You could print a first prototype with the following rules:

## Setup

Deal 5 cards to each player in a 2–3 player game, or 4 cards each in a 4–5 player game. Players hold cards facing away from themselves. Place 8 Insight tokens and 3 Crack tokens nearby. Reveal 2 Blueprint Objective cards.

## Turn

On your turn, do one:

1. Spend 1 Insight to clue another player about all cards of one shape, rank, or pattern.
2. Play one card from your hand.
3. Discard one card from your hand to recover 1 Insight.

After playing or discarding, draw a replacement card.

## Playing

A card is successful if it is the next missing rank in its shape family. Otherwise, discard it and gain 1 Crack.

## Ending

The game ends when the team gets 3 Cracks or after each player takes one final turn once the deck runs out.

## Score

Add the highest completed rank in each shape family, plus objective bonuses.

---

# First 12 Blueprint Objective Cards

Here is a strong starter set.

## 1. Perfect Symmetry

Score +3 if at least three shape families reach rank 5.

## 2. Strong Foundation

Score +2 if all five rank 1 cards are played.

## 3. Complex Forms

Score +1 for each rank 4 or 5 card successfully played.

## 4. Pattern Harmony

Score +1 for each completed shape family containing at least three different patterns.

## 5. Minimal Cracks

Score +3 if the game ends with zero Crack tokens.

## 6. Sharp Design

Score +1 for each completed Triangle, Star, or Hexagon blueprint.

## 7. Smooth Design

Score +1 for each completed Circle or Square blueprint, and +1 if both are completed.

## 8. Odd Structure

Score +2 if every shape family has reached at least rank 3.

## 9. Final Touch

Score +1 for each rank 5 card successfully played.

## 10. Repeating Motif

Score +2 if three completed blueprints contain the same pattern on rank 3.

## 11. Open Space

Score +2 if at least three Hollow cards are successfully played.

## 12. Dense Composition

Score +2 if at least four Solid cards are successfully played.

---

# Naming Options

**Shapes** is clear, but slightly generic. Possible alternatives:

- **Blueprints**
- **Hidden Geometry**
- **Shape Studio**
- **The Geometry Guild**
- **Symmetry**
- **Forms**
- **Pattern Lab**
- **Silent Shapes**
- **Construct**
- **Abstract Assembly**

My favorites:

1. **Hidden Geometry** — best for a deduction game.
2. **Pattern Lab** — friendlier and more playful.
3. **Blueprints** — clean, elegant, and thematic.
4. **Shapes** — simple, but may be hard to trademark or search.

---

# Visual Direction

Use a modern abstract style.

## Palette

Even though the game uses shapes instead of colors as suits, the art can still use color decoratively. But the gameplay identity should not rely on color.

## Card Art

Each family should have a distinct silhouette:

- Circle: smooth and centered.
- Triangle: angular.
- Square: stable and architectural.
- Star: complex and sharp.
- Hexagon: technical or honeycomb-like.

## Pattern Language

Patterns should be obvious from a distance:

- Solid fill
- Horizontal stripes
- Dots
- Hollow outline
- Radiant lines

## Graphic Design Principle

A player should be able to identify a card by:

- Shape alone.
- Rank alone.
- Pattern alone.

No information should depend only on color.

---

# Playtesting Plan

## Prototype 1: Core Viability

Test only:

- 50-card deck.
- Shape/rank/pattern clues.
- 8 Insight tokens.
- 3 Crack tokens.
- No objectives.

Questions to answer:

- Are pattern clues useful?
- Are they too powerful?
- Is the memory burden too high?
- Does the game feel distinct?

## Prototype 2: Objective Cards

Add 2 public objectives.

Questions:

- Do objectives change decisions?
- Are they worth pursuing?
- Do players ignore them?
- Do they create analysis paralysis?

## Prototype 3: Pattern Scoring

Add Harmony scoring.

Questions:

- Does pattern scoring make the game richer?
- Or does it make the game too fiddly?
- Are players willing to delay safe plays for better-pattern cards?

## Prototype 4: Difficulty Tuning

Test:

- 7, 8, and 9 Insight tokens.
- 2, 3, and 4 Crack tokens.
- Objective bonus values.

Track:

- Win rate.
- Average score.
- Number of failed plays.
- Number of dead/discarded critical cards.
- Player confusion moments.

---

# Minimum Viable Prototype

To test this quickly, make:

- 50 index cards.
- 5 shapes.
- Numbers 1–5.
- Simple pattern marks.
- 8 coins for Insight.
- 3 red tokens for Cracks.
- 10 handwritten objective cards.

You do not need polished art yet.

The first thing to test is whether **pattern clues** make the game feel meaningfully different or merely add noise.

---

# Recommended Final Rules Direction

The strongest version is:

**Shapes / Hidden Geometry**

A cooperative deduction game where players assemble five geometric blueprints. Each card has a shape, rank, and pattern. Players cannot see their own cards and must use limited Insights to communicate exact information. Public Blueprint cards create different scoring goals each game, forcing the team to balance safe construction against elegant pattern-based objectives.

That gives you a clean foundation, a distinct identity, and enough design space to develop expansions later.
