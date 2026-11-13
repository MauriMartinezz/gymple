import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { exercises, routineExercises, routines } from "@/infrastructure/db/schema";
import type { Routine, RoutineInput, RoutineItem } from "../domain/routine";
import { UnknownExerciseError, type RoutineRepository } from "../domain/routine-repository";

/** The database or an open transaction: reads run on either. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

const routineColumns = {
  id: routines.id,
  name: routines.name,
  description: routines.description,
  archivedAt: routines.archivedAt,
};

const itemColumns = {
  routineId: routineExercises.routineId,
  exerciseId: routineExercises.exerciseId,
  targetSets: routineExercises.targetSets,
  targetRepsMin: routineExercises.targetRepsMin,
  targetRepsMax: routineExercises.targetRepsMax,
  restSeconds: routineExercises.restSeconds,
  notes: routineExercises.notes,
};

export class DrizzleRoutineRepository implements RoutineRepository {
  constructor(private readonly db: Db) {}

  async list(userId: number, { archived }: { archived: boolean }): Promise<Routine[]> {
    const rows = await this.db
      .select(routineColumns)
      .from(routines)
      .where(
        and(
          eq(routines.userId, userId),
          archived ? isNotNull(routines.archivedAt) : isNull(routines.archivedAt),
        ),
      )
      .orderBy(asc(routines.name), asc(routines.id));
    return withItems(this.db, rows);
  }

  async findById(userId: number, id: number): Promise<Routine | null> {
    return findOwned(this.db, userId, id);
  }

  async create(userId: number, input: RoutineInput): Promise<Routine> {
    return this.db.transaction(async (tx) => {
      await assertOwnsExercises(tx, userId, input);
      const [{ id }] = await tx
        .insert(routines)
        .values({ userId, name: input.name, description: input.description })
        .$returningId();
      await insertItems(tx, id, input.items);
      const created = await findOwned(tx, userId, id);
      if (!created) throw new Error(`Routine ${id} vanished right after insert.`);
      return created;
    });
  }

  async update(userId: number, id: number, input: RoutineInput): Promise<Routine | null> {
    return this.db.transaction(async (tx) => {
      // Lock the routine row so concurrent saves replace the items one after the other.
      const [existing] = await tx.select({ id: routines.id }).from(routines).where(ownedBy(userId, id)).for("update");
      if (!existing) return null;
      await assertOwnsExercises(tx, userId, input);
      await tx
        .update(routines)
        .set({ name: input.name, description: input.description })
        .where(ownedBy(userId, id));
      // Replace the whole list; the transaction keeps the previous items on failure.
      await tx.delete(routineExercises).where(eq(routineExercises.routineId, id));
      await insertItems(tx, id, input.items);
      return findOwned(tx, userId, id);
    });
  }

  async setArchived(userId: number, id: number, archived: boolean): Promise<boolean> {
    if (!(await this.findById(userId, id))) return false;
    await this.db
      .update(routines)
      // Archiving twice keeps the original date.
      .set({ archivedAt: archived ? sql`COALESCE(${routines.archivedAt}, NOW())` : null })
      .where(ownedBy(userId, id));
    return true;
  }
}

/** The ownership filter: every routine query goes through it. */
function ownedBy(userId: number, id: number) {
  return and(eq(routines.id, id), eq(routines.userId, userId));
}

async function findOwned(db: Executor, userId: number, id: number): Promise<Routine | null> {
  const [row] = await db.select(routineColumns).from(routines).where(ownedBy(userId, id));
  if (!row) return null;
  const [routine] = await withItems(db, [row]);
  return routine;
}

/** Loads the items of every given routine in one query, ordered by position. */
async function withItems(db: Executor, rows: Omit<Routine, "items">[]): Promise<Routine[]> {
  if (rows.length === 0) return [];
  const itemRows = await db
    .select(itemColumns)
    .from(routineExercises)
    .where(
      inArray(
        routineExercises.routineId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(routineExercises.routineId), asc(routineExercises.position));

  const itemsByRoutine = new Map<number, RoutineItem[]>();
  for (const { routineId, ...item } of itemRows) {
    const items = itemsByRoutine.get(routineId) ?? [];
    items.push(item);
    itemsByRoutine.set(routineId, items);
  }
  return rows.map((row) => ({ ...row, items: itemsByRoutine.get(row.id) ?? [] }));
}

/**
 * Every item must reference an exercise the user owns (archived ones included).
 * @throws UnknownExerciseError with every offending item index, in item order.
 */
async function assertOwnsExercises(db: Executor, userId: number, input: RoutineInput): Promise<void> {
  const ids = [...new Set(input.items.map((item) => item.exerciseId))];
  if (ids.length === 0) return;
  const owned = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.userId, userId), inArray(exercises.id, ids)));
  const ownedIds = new Set(owned.map((row) => row.id));
  const unknown = input.items.flatMap((item, index) => (ownedIds.has(item.exerciseId) ? [] : [index]));
  if (unknown.length > 0) throw new UnknownExerciseError(unknown);
}

async function insertItems(db: Executor, routineId: number, items: RoutineItem[]): Promise<void> {
  if (items.length === 0) return;
  await db.insert(routineExercises).values(items.map((item, position) => ({ routineId, position, ...item })));
}
