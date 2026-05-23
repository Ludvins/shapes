import type { ObjectiveCard, Pattern, Rank, ShapeFamily } from "./types.js";

export const SHAPE_FAMILIES = [
  "circle",
  "triangle",
  "square",
  "star",
  "hexagon"
] as const satisfies readonly ShapeFamily[];

export const RANKS = [1, 2, 3, 4, 5] as const satisfies readonly Rank[];

export const PATTERNS = [
  "solid",
  "striped",
  "dotted",
  "hollow",
  "radiant"
] as const satisfies readonly Pattern[];

export const MAX_INSIGHT_TOKENS = 8;
export const MAX_CRACK_TOKENS = 3;

export const RANK_PATTERN_DISTRIBUTION: Record<Rank, Pattern[]> = {
  1: ["solid", "striped", "dotted"],
  2: ["solid", "hollow"],
  3: ["striped", "dotted"],
  4: ["solid", "hollow"],
  5: ["radiant"]
};

export const OBJECTIVE_CARDS: ObjectiveCard[] = [
  {
    id: "perfect-symmetry",
    name: "Perfect Symmetry",
    description: "Score +3 if at least three shape families reach rank 5."
  },
  {
    id: "strong-foundation",
    name: "Strong Foundation",
    description: "Score +2 if all five rank 1 cards are played."
  },
  {
    id: "complex-forms",
    name: "Complex Forms",
    description: "Score +1 for each rank 4 or 5 card successfully played."
  },
  {
    id: "pattern-harmony",
    name: "Pattern Harmony",
    description: "Score +1 for each completed shape family containing at least three different patterns."
  },
  {
    id: "minimal-cracks",
    name: "Minimal Cracks",
    description: "Score +3 if the game ends with zero Crack tokens."
  },
  {
    id: "sharp-design",
    name: "Sharp Design",
    description: "Score +1 for each completed Triangle, Star, or Hexagon blueprint."
  },
  {
    id: "smooth-design",
    name: "Smooth Design",
    description: "Score +1 for each completed Circle or Square blueprint, plus +1 if both are completed."
  },
  {
    id: "odd-structure",
    name: "Odd Structure",
    description: "Score +2 if every shape family has reached at least rank 3."
  },
  {
    id: "final-touch",
    name: "Final Touch",
    description: "Score +1 for each rank 5 card successfully played."
  },
  {
    id: "repeating-motif",
    name: "Repeating Motif",
    description: "Score +2 if three completed blueprints contain the same pattern on rank 3."
  },
  {
    id: "open-space",
    name: "Open Space",
    description: "Score +2 if at least three Hollow cards are successfully played."
  },
  {
    id: "dense-composition",
    name: "Dense Composition",
    description: "Score +2 if at least four Solid cards are successfully played."
  }
];
