import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { exercises } from "@/infrastructure/db/schema";
import type { Exercise, ExerciseInput } from "../domain/exercise";
import { DuplicateExerciseNameError, type ExerciseRepository } from "../domain/exercise-repository";

const columns = {
  id: exercises.id,
  name: exercises.name,
  muscleGroup: exercises.muscleGroup,
  notes: exercises.notes,
  archivedAt: exercises.archivedAt,
};

export class DrizzleExerciseRepository implements ExerciseRepository {
  constructor(private readonly db: Db) {}

  async list(userId: number, { archived }: { archived: boolean }): Promise<Exercise[]> {
    return this.db
      .select(columns)
      .from(exercises)
      .where(
        and(
          eq(exercises.userId, userId),
          archived ? isNotNull(exercises.archivedAt) : isNull(exercises.archivedAt),
        ),
      )
      .orderBy(asc(exercises.name));
  }

  async findById(userId: number, id: number): Promise<Exercise | null> {
    const [row] = await this.db.select(columns).from(exercises).where(ownedBy(userId, id));
    return row ?? null;
  }

  async create(userId: number, input: ExerciseInput): Promise<Exercise> {
    const [{ id }] = await rethrowDuplicate(input.name, () =>
      this.db.insert(exercises).values({ userId, ...input }).$returningId(),
    );
    const created = await this.findById(userId, id);
    if (!created) throw new Error(`Exercise ${id} vanished right after insert.`);
    return created;
  }

  async update(userId: number, id: number, input: ExerciseInput): Promise<Exercise | null> {
    if (!(await this.findById(userId, id))) return null;
    await rethrowDuplicate(input.name, () =>
      this.db.update(exercises).set(input).where(ownedBy(userId, id)),
    );
    return this.findById(userId, id);
  }

  async setArchived(userId: number, id: number, archived: boolean): Promise<boolean> {
    if (!(await this.findById(userId, id))) return false;
    await this.db
      .update(exercises)
      // Archiving twice keeps the original date.
      .set({ archivedAt: archived ? sql`COALESCE(${exercises.archivedAt}, NOW())` : null })
      .where(ownedBy(userId, id));
    return true;
  }
}

/** The ownership filter: every query goes through it. */
function ownedBy(userId: number, id: number) {
  return and(eq(exercises.id, id), eq(exercises.userId, userId));
}

async function rethrowDuplicate<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isDuplicateEntry(error)) throw new DuplicateExerciseNameError(name);
    throw error;
  }
}

/** MySQL ER_DUP_ENTRY, possibly wrapped by Drizzle in DrizzleQueryError.cause. */
function isDuplicateEntry(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ((current as { code?: string }).code === "ER_DUP_ENTRY") return true;
    current = current.cause;
  }
  return false;
}
