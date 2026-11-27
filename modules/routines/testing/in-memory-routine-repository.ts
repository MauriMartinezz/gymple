import type { Routine, RoutineInput } from "../domain/routine";
import { UnknownExerciseError, type RoutineRepository } from "../domain/routine-repository";

/**
 * Test double for RoutineRepository. Mirrors the Postgres adapter's behavior:
 * user-scoped access, case-insensitive name ordering, and items that may only
 * reference exercises the user owns. Register those with `addExercise`.
 * Both implementations run the same contract suite.
 */
export class InMemoryRoutineRepository implements RoutineRepository {
  private rows: Array<Routine & { userId: number }> = [];
  private exerciseOwners = new Map<number, number>();
  private nextId = 1;

  /** Makes an exercise id known as owned by the user (archived or not). */
  addExercise(userId: number, exerciseId: number) {
    this.exerciseOwners.set(exerciseId, userId);
  }

  async list(userId: number, { archived }: { archived: boolean }): Promise<Routine[]> {
    return this.rows
      .filter((row) => row.userId === userId && (row.archivedAt !== null) === archived)
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
      .map(toRoutine);
  }

  async findById(userId: number, id: number): Promise<Routine | null> {
    const row = this.find(userId, id);
    return row ? toRoutine(row) : null;
  }

  async create(userId: number, input: RoutineInput): Promise<Routine> {
    this.assertOwnsExercises(userId, input);
    const row = { id: this.nextId++, userId, ...copyInput(input), archivedAt: null };
    this.rows.push(row);
    return toRoutine(row);
  }

  async update(userId: number, id: number, input: RoutineInput): Promise<Routine | null> {
    const row = this.find(userId, id);
    if (!row) return null;
    this.assertOwnsExercises(userId, input);
    Object.assign(row, copyInput(input));
    return toRoutine(row);
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

  private assertOwnsExercises(userId: number, input: RoutineInput) {
    const unknown = input.items.flatMap((item, index) =>
      this.exerciseOwners.get(item.exerciseId) === userId ? [] : [index],
    );
    if (unknown.length > 0) throw new UnknownExerciseError(unknown);
  }
}

function copyInput(input: RoutineInput): RoutineInput {
  return { name: input.name, description: input.description, items: input.items.map((item) => ({ ...item })) };
}

function toRoutine(row: Routine): Routine {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    items: row.items.map((item) => ({ ...item })),
    archivedAt: row.archivedAt,
  };
}
