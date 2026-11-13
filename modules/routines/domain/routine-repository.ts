import type { Routine, RoutineInput } from "./routine";

/**
 * Persistence port. Every method is scoped to one user: an id that belongs to
 * another user behaves exactly like an id that does not exist.
 *
 * Items may only reference exercises owned by the same user (archived ones
 * included). Only the repository can see exercises, so it enforces that and
 * saves nothing when an item fails the check.
 */
export interface RoutineRepository {
  list(userId: number, filter: { archived: boolean }): Promise<Routine[]>;
  findById(userId: number, id: number): Promise<Routine | null>;
  /** @throws UnknownExerciseError */
  create(userId: number, input: RoutineInput): Promise<Routine>;
  /**
   * Replaces the name, description and the whole item list atomically.
   * Returns null when the routine does not exist. @throws UnknownExerciseError
   */
  update(userId: number, id: number, input: RoutineInput): Promise<Routine | null>;
  /** Returns false when the routine does not exist. */
  setArchived(userId: number, id: number, archived: boolean): Promise<boolean>;
}

/** Some items reference an exercise the user does not own, or that does not exist. */
export class UnknownExerciseError extends Error {
  constructor(readonly itemIndexes: number[]) {
    super(`Unknown exercise in routine items ${itemIndexes.join(", ")}.`);
    this.name = "UnknownExerciseError";
  }
}
