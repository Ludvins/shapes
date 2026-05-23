import { SHAPE_FAMILIES } from "./constants.js";
import type { Card, GameState, ObjectiveScore, ScoreBreakdown, ShapeFamily } from "./types.js";

function completedRank(cards: Card[]): number {
  return cards.length === 0 ? 0 : Math.max(...cards.map((card) => card.rank));
}

function countBlueprintCards(state: GameState, predicate: (card: Card) => boolean): number {
  return SHAPE_FAMILIES.reduce(
    (count, shape) => count + state.blueprints[shape].filter(predicate).length,
    0
  );
}

function scoreObjective(state: GameState, objectiveId: string): Omit<ObjectiveScore, "objective"> {
  switch (objectiveId) {
    case "perfect-symmetry": {
      const completed = SHAPE_FAMILIES.filter((shape) => state.blueprints[shape].length === 5).length;
      return {
        points: completed >= 3 ? 3 : 0,
        achieved: completed >= 3,
        detail: `${completed}/3 completed shape families`
      };
    }
    case "strong-foundation": {
      const foundations = SHAPE_FAMILIES.filter((shape) =>
        state.blueprints[shape].some((card) => card.rank === 1)
      ).length;
      return {
        points: foundations === 5 ? 2 : 0,
        achieved: foundations === 5,
        detail: `${foundations}/5 rank 1 cards played`
      };
    }
    case "complex-forms": {
      const count = countBlueprintCards(state, (card) => card.rank >= 4);
      return {
        points: count,
        achieved: count > 0,
        detail: `${count} rank 4 or 5 cards played`
      };
    }
    case "pattern-harmony": {
      const count = SHAPE_FAMILIES.filter((shape) => {
        const cards = state.blueprints[shape];
        return cards.length === 5 && new Set(cards.map((card) => card.pattern)).size >= 3;
      }).length;
      return {
        points: count,
        achieved: count > 0,
        detail: `${count} completed blueprints with 3+ patterns`
      };
    }
    case "minimal-cracks":
      return {
        points: state.crackTokens === 0 ? 3 : 0,
        achieved: state.crackTokens === 0,
        detail: `${state.crackTokens} Crack tokens`
      };
    case "sharp-design": {
      const sharpShapes: ShapeFamily[] = ["triangle", "star", "hexagon"];
      const count = sharpShapes.filter((shape) => state.blueprints[shape].length === 5).length;
      return {
        points: count,
        achieved: count > 0,
        detail: `${count}/3 sharp blueprints completed`
      };
    }
    case "smooth-design": {
      const circle = state.blueprints.circle.length === 5;
      const square = state.blueprints.square.length === 5;
      const points = Number(circle) + Number(square) + Number(circle && square);
      return {
        points,
        achieved: points > 0,
        detail: `${points} smooth design points`
      };
    }
    case "odd-structure": {
      const ready = SHAPE_FAMILIES.filter((shape) => completedRank(state.blueprints[shape]) >= 3).length;
      return {
        points: ready === 5 ? 2 : 0,
        achieved: ready === 5,
        detail: `${ready}/5 blueprints reached rank 3`
      };
    }
    case "final-touch": {
      const count = countBlueprintCards(state, (card) => card.rank === 5);
      return {
        points: count,
        achieved: count > 0,
        detail: `${count} rank 5 cards played`
      };
    }
    case "repeating-motif": {
      const rankThreePatterns = SHAPE_FAMILIES.map((shape) =>
        state.blueprints[shape].find((card) => card.rank === 3)
      ).filter((card): card is Card => Boolean(card));
      const counts = new Map<string, number>();
      rankThreePatterns.forEach((card) => counts.set(card.pattern, (counts.get(card.pattern) ?? 0) + 1));
      const best = Math.max(0, ...counts.values());
      return {
        points: best >= 3 ? 2 : 0,
        achieved: best >= 3,
        detail: `${best}/3 matching rank 3 patterns`
      };
    }
    case "open-space": {
      const count = countBlueprintCards(state, (card) => card.pattern === "hollow");
      return {
        points: count >= 3 ? 2 : 0,
        achieved: count >= 3,
        detail: `${count}/3 Hollow cards played`
      };
    }
    case "dense-composition": {
      const count = countBlueprintCards(state, (card) => card.pattern === "solid");
      return {
        points: count >= 4 ? 2 : 0,
        achieved: count >= 4,
        detail: `${count}/4 Solid cards played`
      };
    }
    default:
      return {
        points: 0,
        achieved: false,
        detail: "Objective scoring is not implemented."
      };
  }
}

export function scoreGame(state: GameState): ScoreBreakdown {
  const byShape = SHAPE_FAMILIES.reduce(
    (scores, shape) => ({
      ...scores,
      [shape]: completedRank(state.blueprints[shape])
    }),
    {} as Record<ShapeFamily, number>
  );
  const baseScore = Object.values(byShape).reduce((total, points) => total + points, 0);
  const objectives = state.objectives.map((objective) => ({
    objective,
    ...scoreObjective(state, objective.id)
  }));
  const objectiveScore = objectives.reduce((total, objective) => total + objective.points, 0);
  const totalScore = baseScore + objectiveScore;

  return {
    baseScore,
    objectiveScore,
    totalScore,
    rating: getRating(totalScore),
    byShape,
    objectives
  };
}

export function getRating(score: number): string {
  if (score <= 8) {
    return "Broken draft";
  }
  if (score <= 15) {
    return "Functional design";
  }
  if (score <= 22) {
    return "Refined composition";
  }
  if (score <= 27) {
    return "Geometric masterwork";
  }
  return "Perfect symmetry";
}
