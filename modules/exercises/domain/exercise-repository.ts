import type { Exercise, ExerciseInput } from "./exercise";

/**
 * Persistence port. Every method is scoped to one user: an id that belongs to
 * another user behaves exactly like an id that does not exist.
 */
export interface ExerciseRepository {
  list(userId: number, filter: { archived: boolean }): Promise<Exercise[]>;
  findById(userId: number, id: number): Promise<Exercise | null>;
  /** @throws DuplicateExerciseNameError */
  create(userId: number, input: ExerciseInput): Promise<Exercise>;
  /** Returns null when the exercise does not exist. @throws DuplicateExerciseNameError */
  update(userId: number, id: number, input: ExerciseInput): Promise<Exercise | null>;
  /** Returns false when the exercise does not exist. */
  setArchived(userId: number, id: number, archived: boolean): Promise<boolean>;
}

/** Names are unique per user, archived exercises included. */
export class DuplicateExerciseNameError extends Error {
  constructor(readonly exerciseName: string) {
    super(`An exercise named "${exerciseName}" already exists.`);
    this.name = "DuplicateExerciseNameError";
  }
}
