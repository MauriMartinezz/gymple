import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, max, ne, sql } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { exercises, routines, sessionSets, users, workoutSessions } from "@/infrastructure/db/schema";
import type { LoggedSet, SetInput, WorkoutSession } from "../domain/session";
import {
  ActiveSessionExistsError,
  EmptySessionError,
  ExerciseNotAllowedError,
  LastSetOfFinishedSessionError,
  UnknownRoutineError,
  type SessionRepository,
} from "../domain/session-repository";

/** The database or an open transaction: reads run on either. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

const sessionColumns = {
  id: workoutSessions.id,
  routineId: workoutSessions.routineId,
  startedAt: workoutSessions.startedAt,
  finishedAt: workoutSessions.finishedAt,
  notes: workoutSessions.notes,
};

const setColumns = {
  id: sessionSets.id,
  sessionId: sessionSets.sessionId,
  exerciseId: sessionSets.exerciseId,
  setNumber: sessionSets.setNumber,
  weightKg: sessionSets.weightKg,
  reps: sessionSets.reps,
  rpe: sessionSets.rpe,
  restSeconds: sessionSets.restSeconds,
  completedAt: sessionSets.completedAt,
};

type SessionRow = Omit<WorkoutSession, "sets">;
/** A set as mysql2 returns it: DECIMAL columns come back as strings. */
type SetRow = Omit<LoggedSet, "weightKg" | "rpe"> & { sessionId: number; weightKg: string; rpe: string | null };

export class DrizzleSessionRepository implements SessionRepository {
  /** Takes the database, or an open transaction to join it (its own transactions become savepoints). */
  constructor(private readonly db: Executor) {}

  async findActive(userId: number): Promise<WorkoutSession | null> {
    const rows = await this.db
      .select(sessionColumns)
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.finishedAt)))
      .orderBy(desc(workoutSessions.id))
      .limit(1);
    const [session] = await withSets(this.db, rows);
    return session ?? null;
  }

  async findById(userId: number, id: number): Promise<WorkoutSession | null> {
    return findOwned(this.db, userId, id);
  }

  async listFinished(userId: number): Promise<WorkoutSession[]> {
    const rows = await this.db
      .select(sessionColumns)
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), isNotNull(workoutSessions.finishedAt)))
      .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id));
    return withSets(this.db, rows);
  }

  async start(userId: number, routineId: number | null): Promise<WorkoutSession> {
    return this.db.transaction(async (tx) => {
      // Lock the user so two concurrent starts check for an active session one after the other.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const [active] = await tx
        .select({ id: workoutSessions.id })
        .from(workoutSessions)
        .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.finishedAt)))
        .limit(1);
      if (active) throw new ActiveSessionExistsError(active.id);
      if (routineId !== null) {
        const [routine] = await tx
          .select({ id: routines.id })
          .from(routines)
          .where(and(eq(routines.id, routineId), eq(routines.userId, userId), isNull(routines.archivedAt)));
        if (!routine) throw new UnknownRoutineError(routineId);
      }
      const [{ id }] = await tx.insert(workoutSessions).values({ userId, routineId }).$returningId();
      const created = await findOwned(tx, userId, id);
      if (!created) throw new Error(`Session ${id} vanished right after insert.`);
      return created;
    });
  }

  async addSet(userId: number, sessionId: number, exerciseId: number, input: SetInput): Promise<LoggedSet | null> {
    return this.db.transaction(async (tx) => {
      // Lock the session so concurrent sets of one exercise get distinct numbers.
      const session = await lockOwned(tx, userId, sessionId);
      if (!session || session.finishedAt !== null) return null;
      await assertCanLog(tx, userId, sessionId, exerciseId);
      const [{ last }] = await tx
        .select({ last: max(sessionSets.setNumber) })
        .from(sessionSets)
        .where(and(eq(sessionSets.sessionId, sessionId), eq(sessionSets.exerciseId, exerciseId)));
      const [{ id }] = await tx
        .insert(sessionSets)
        .values({ sessionId, exerciseId, setNumber: (last ?? 0) + 1, ...toColumns(input) })
        .$returningId();
      return findSet(tx, sessionId, id);
    });
  }

  async updateSet(userId: number, sessionId: number, setId: number, input: SetInput): Promise<LoggedSet | null> {
    return this.db.transaction(async (tx) => {
      if (!(await lockOwned(tx, userId, sessionId))) return null;
      if (!(await findSet(tx, sessionId, setId))) return null;
      await tx.update(sessionSets).set(toColumns(input)).where(inSession(sessionId, setId));
      return findSet(tx, sessionId, setId);
    });
  }

  async deleteSet(userId: number, sessionId: number, setId: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const session = await lockOwned(tx, userId, sessionId);
      if (!session) return false;
      const deleted = await findSet(tx, sessionId, setId);
      if (!deleted) return false;
      if (session.finishedAt !== null) {
        const [other] = await tx
          .select({ id: sessionSets.id })
          .from(sessionSets)
          .where(and(eq(sessionSets.sessionId, sessionId), ne(sessionSets.id, setId)))
          .limit(1);
        if (!other) throw new LastSetOfFinishedSessionError(sessionId);
      }
      await tx.delete(sessionSets).where(inSession(sessionId, setId));
      // Close the gap so the exercise's numbers stay 1..n.
      await tx
        .update(sessionSets)
        .set({ setNumber: sql`${sessionSets.setNumber} - 1` })
        .where(
          and(
            eq(sessionSets.sessionId, sessionId),
            eq(sessionSets.exerciseId, deleted.exerciseId),
            gt(sessionSets.setNumber, deleted.setNumber),
          ),
        );
      return true;
    });
  }

  async finish(userId: number, sessionId: number, notes: string | null): Promise<WorkoutSession | null> {
    return this.db.transaction(async (tx) => {
      const session = await lockOwned(tx, userId, sessionId);
      if (!session || session.finishedAt !== null) return null;
      const [anySet] = await tx
        .select({ id: sessionSets.id })
        .from(sessionSets)
        .where(eq(sessionSets.sessionId, sessionId))
        .limit(1);
      if (!anySet) throw new EmptySessionError(sessionId);
      await tx
        .update(workoutSessions)
        .set({ finishedAt: sql`NOW()`, notes })
        .where(ownedBy(userId, sessionId));
      return findOwned(tx, userId, sessionId);
    });
  }

  async discard(userId: number, sessionId: number): Promise<boolean> {
    const [result] = await this.db
      .delete(workoutSessions) // cascades to its sets
      .where(and(ownedBy(userId, sessionId), isNull(workoutSessions.finishedAt)));
    return result.affectedRows > 0;
  }

  async deleteFinished(userId: number, sessionId: number): Promise<boolean> {
    const [result] = await this.db
      .delete(workoutSessions) // cascades to its sets
      .where(and(ownedBy(userId, sessionId), isNotNull(workoutSessions.finishedAt)));
    return result.affectedRows > 0;
  }

  async lastPerformance(userId: number, exerciseId: number): Promise<LoggedSet | null> {
    const [row] = await this.db
      .select(setColumns)
      .from(sessionSets)
      .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
      .where(
        and(
          eq(workoutSessions.userId, userId),
          isNotNull(workoutSessions.finishedAt),
          eq(sessionSets.exerciseId, exerciseId),
        ),
      )
      .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id), desc(sessionSets.setNumber))
      .limit(1);
    return row ? toLoggedSet(row) : null;
  }
}

/** The ownership filter: every session query goes through it. */
function ownedBy(userId: number, id: number) {
  return and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId));
}

/** A set reached through its session: a set of another session behaves like a missing one. */
function inSession(sessionId: number, setId: number) {
  return and(eq(sessionSets.id, setId), eq(sessionSets.sessionId, sessionId));
}

/** Locks the user's session row for the rest of the transaction. */
async function lockOwned(tx: Tx, userId: number, id: number): Promise<SessionRow | null> {
  const [row] = await tx.select(sessionColumns).from(workoutSessions).where(ownedBy(userId, id)).for("update");
  return row ?? null;
}

async function findOwned(db: Executor, userId: number, id: number): Promise<WorkoutSession | null> {
  const [row] = await db.select(sessionColumns).from(workoutSessions).where(ownedBy(userId, id));
  if (!row) return null;
  const [session] = await withSets(db, [row]);
  return session;
}

/** Callers must have checked that the session belongs to the user. */
async function findSet(db: Executor, sessionId: number, setId: number): Promise<LoggedSet | null> {
  const [row] = await db.select(setColumns).from(sessionSets).where(inSession(sessionId, setId));
  return row ? toLoggedSet(row) : null;
}

/** Loads the sets of every given session in one query, in logging order. */
async function withSets(db: Executor, rows: SessionRow[]): Promise<WorkoutSession[]> {
  if (rows.length === 0) return [];
  const setRows = await db
    .select(setColumns)
    .from(sessionSets)
    .where(
      inArray(
        sessionSets.sessionId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(sessionSets.id));

  const setsBySession = new Map<number, LoggedSet[]>();
  for (const row of setRows) {
    const sets = setsBySession.get(row.sessionId) ?? [];
    sets.push(toLoggedSet(row));
    setsBySession.set(row.sessionId, sets);
  }
  return rows.map((row) => ({ ...row, sets: setsBySession.get(row.id) ?? [] }));
}

/**
 * The exercise must be the user's and active, unless it already has sets in
 * this session (archiving it mid-workout keeps it loggable).
 * @throws ExerciseNotAllowedError
 */
async function assertCanLog(tx: Tx, userId: number, sessionId: number, exerciseId: number): Promise<void> {
  const [exercise] = await tx
    .select({ archivedAt: exercises.archivedAt })
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)));
  if (!exercise) throw new ExerciseNotAllowedError(exerciseId);
  if (exercise.archivedAt === null) return;
  const [logged] = await tx
    .select({ id: sessionSets.id })
    .from(sessionSets)
    .where(and(eq(sessionSets.sessionId, sessionId), eq(sessionSets.exerciseId, exerciseId)))
    .limit(1);
  if (!logged) throw new ExerciseNotAllowedError(exerciseId);
}

// mysql2 reads DECIMAL columns as strings; write them as fixed-point strings too.
function toColumns(input: SetInput) {
  return {
    weightKg: input.weightKg.toFixed(2),
    reps: input.reps,
    rpe: input.rpe === null ? null : input.rpe.toFixed(1),
    restSeconds: input.restSeconds,
  };
}

function toLoggedSet(row: SetRow): LoggedSet {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    setNumber: row.setNumber,
    weightKg: Number(row.weightKg),
    reps: row.reps,
    rpe: row.rpe === null ? null : Number(row.rpe),
    restSeconds: row.restSeconds,
    completedAt: row.completedAt,
  };
}
