import type { Exercise, ExerciseInput } from "../domain/exercise";
import { DuplicateExerciseNameError, type ExerciseRepository } from "../domain/exercise-repository";

/**
 * Test double for ExerciseRepository. Mirrors the MySQL adapter's behavior,
 * including case-insensitive name uniqueness (the table's collation is _ci).
 * Both implementations run the same contract suite.
 */
export class InMemoryExerciseRepository implements ExerciseRepository {
  private rows: Array<Exercise & { userId: number }> = [];
  private nextId = 1;

  async list(userId: number, { archived }: { archived: boolean }): Promise<Exercise[]> {
    return this.rows
      .filter((row) => row.userId === userId && (row.archivedAt !== null) === archived)
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
      .map(toExercise);
  }

  async findById(userId: number, id: number): Promise<Exercise | null> {
    const row = this.find(userId, id);
    return row ? toExercise(row) : null;
  }

  async create(userId: number, input: ExerciseInput): Promise<Exercise> {
    this.assertUniqueName(userId, input.name);
    const row = { id: this.nextId++, userId, ...input, archivedAt: null };
    this.rows.push(row);
    return toExercise(row);
  }

  async update(userId: number, id: number, input: ExerciseInput): Promise<Exercise | null> {
    const row = this.find(userId, id);
    if (!row) return null;
    this.assertUniqueName(userId, input.name, id);
    Object.assign(row, input);
    return toExercise(row);
  }

  async setArchived(userId: number, id: number, archived: boolean): Promise<boolean> {
    const row = this.find(userId, id);
    if (!row) return false;
    row.archivedAt = archived ? (row.archivedAt ?? new Date()) : null;
    return true;
  }

  private find(userId: number, id: number) {
    return this.rows.find((row) => row.userId === userId && row.id === id);
  }

  private assertUniqueName(userId: number, name: string, exceptId?: number) {
    const taken = this.rows.some(
      (row) =>
        row.userId === userId &&
        row.id !== exceptId &&
        row.name.localeCompare(name, "en", { sensitivity: "base" }) === 0,
    );
    if (taken) throw new DuplicateExerciseNameError(name);
  }
}

function toExercise({ userId: _userId, ...exercise }: Exercise & { userId: number }): Exercise {
  return { ...exercise };
}
