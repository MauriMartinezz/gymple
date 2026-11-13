/**
 * Estimated one-rep max (1RM): the heaviest weight you could lift once,
 * derived from a set performed with more reps.
 */

export type OneRepMaxFormula = "epley" | "brzycki";

export interface PerformedSet {
  weightKg: number;
  reps: number;
}

/** Above this rep count every formula drifts too far to be trusted. */
export const RELIABLE_REPS_LIMIT = 10;

const formulas: Record<OneRepMaxFormula, (weightKg: number, reps: number) => number> = {
  epley: (weightKg, reps) => weightKg * (1 + reps / 30),
  brzycki: (weightKg, reps) => {
    if (reps >= 37) {
      throw new RangeError("Brzycki is undefined for 37 or more reps.");
    }
    return (weightKg * 36) / (37 - reps);
  },
};

export function estimateOneRepMax(
  { weightKg, reps }: PerformedSet,
  formula: OneRepMaxFormula = "epley",
): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError(`Weight must be a positive number, got ${weightKg}.`);
  }
  if (!Number.isInteger(reps) || reps < 1) {
    throw new RangeError(`Reps must be a positive integer, got ${reps}.`);
  }
  // A single rep already is the max; formulas would otherwise inflate it.
  if (reps === 1) return weightKg;

  return formulas[formula](weightKg, reps);
}

export function isReliableEstimate(reps: number): boolean {
  return reps <= RELIABLE_REPS_LIMIT;
}
