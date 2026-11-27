import type { LoggedSet, SetInput, WorkoutSession } from "../domain/session";
import {
  ActiveSessionExistsError,
  EmptySessionError,
  ExerciseNotAllowedError,
  LastSetOfFinishedSessionError,
  UnknownRoutineError,
  type SessionRepository,
} from "../domain/session-repository";

interface Owned {
  userId: number;
  archived: boolean;
}

type SessionRow = WorkoutSession & { userId: number };

/**
 * Test double for SessionRepository. Mirrors the Postgres adapter's behavior:
 * user-scoped access, one active session per user, per-exercise set numbers,
 * and ownership checks on exercises and routines. Register those with
 * `addExercise` and `addRoutine`. Both implementations run the same contract.
 */
export class InMemorySessionRepository implements SessionRepository {
  private rows: SessionRow[] = [];
  private exercises = new Map<number, Owned>();
  private routines = new Map<number, Owned>();
  private nextSessionId = 1;
  private nextSetId = 1;

  /** Makes an exercise id known as owned by the user. */
  addExercise(userId: number, exerciseId: number, { archived = false } = {}) {
    this.exercises.set(exerciseId, { userId, archived });
  }

  archiveExercise(exerciseId: number) {
    const exercise = this.exercises.get(exerciseId);
    if (exercise) exercise.archived = true;
  }

  /** Makes a routine id known as owned by the user. */
  addRoutine(userId: number, routineId: number, { archived = false } = {}) {
    this.routines.set(routineId, { userId, archived });
  }

  async findActive(userId: number): Promise<WorkoutSession | null> {
    const row = this.rows.find((r) => r.userId === userId && r.finishedAt === null);
    return row ? toSession(row) : null;
  }

  async findById(userId: number, id: number): Promise<WorkoutSession | null> {
    const row = this.find(userId, id);
    return row ? toSession(row) : null;
  }

  async listFinished(userId: number): Promise<WorkoutSession[]> {
    return this.finishedRows(userId).map(toSession);
  }

  async start(userId: number, routineId: number | null): Promise<WorkoutSession> {
    const active = this.rows.find((r) => r.userId === userId && r.finishedAt === null);
    if (active) throw new ActiveSessionExistsError(active.id);
    if (routineId !== null) {
      const routine = this.routines.get(routineId);
      if (!routine || routine.userId !== userId || routine.archived) throw new UnknownRoutineError(routineId);
    }
    const row: SessionRow = {
      id: this.nextSessionId++,
      userId,
      routineId,
      startedAt: new Date(),
      finishedAt: null,
      notes: null,
      sets: [],
    };
    this.rows.push(row);
    return toSession(row);
  }

  async addSet(userId: number, sessionId: number, exerciseId: number, input: SetInput): Promise<LoggedSet | null> {
    const row = this.find(userId, sessionId);
    if (!row || row.finishedAt !== null) return null;
    const exercise = this.exercises.get(exerciseId);
    const earlier = row.sets.filter((s) => s.exerciseId === exerciseId);
    if (!exercise || exercise.userId !== userId || (exercise.archived && earlier.length === 0)) {
      throw new ExerciseNotAllowedError(exerciseId);
    }
    const set: LoggedSet = {
      id: this.nextSetId++,
      exerciseId,
      setNumber: Math.max(0, ...earlier.map((s) => s.setNumber)) + 1,
      ...copyInput(input),
      completedAt: new Date(),
    };
    row.sets.push(set);
    return { ...set };
  }

  async updateSet(userId: number, sessionId: number, setId: number, input: SetInput): Promise<LoggedSet | null> {
    const set = this.find(userId, sessionId)?.sets.find((s) => s.id === setId);
    if (!set) return null;
    Object.assign(set, copyInput(input));
    return { ...set };
  }

  async deleteSet(userId: number, sessionId: number, setId: number): Promise<boolean> {
    const row = this.find(userId, sessionId);
    const set = row?.sets.find((s) => s.id === setId);
    if (!row || !set) return false;
    if (row.finishedAt !== null && row.sets.length === 1) throw new LastSetOfFinishedSessionError(sessionId);
    row.sets = row.sets.filter((s) => s.id !== setId);
    for (const other of row.sets) {
      if (other.exerciseId === set.exerciseId && other.setNumber > set.setNumber) other.setNumber -= 1;
    }
    return true;
  }

  async finish(userId: number, sessionId: number, notes: string | null): Promise<WorkoutSession | null> {
    const row = this.find(userId, sessionId);
    if (!row || row.finishedAt !== null) return null;
    if (row.sets.length === 0) throw new EmptySessionError(sessionId);
    row.finishedAt = new Date();
    row.notes = notes;
    return toSession(row);
  }

  async discard(userId: number, sessionId: number): Promise<boolean> {
    return this.remove(userId, sessionId, { finished: false });
  }

  async deleteFinished(userId: number, sessionId: number): Promise<boolean> {
    return this.remove(userId, sessionId, { finished: true });
  }

  async lastPerformances(userId: number, exerciseIds: readonly number[]): Promise<Map<number, LoggedSet>> {
    const found = new Map<number, LoggedSet>();
    for (const exerciseId of new Set(exerciseIds)) {
      // Rows come newest first: the first session that logged it wins.
      for (const row of this.finishedRows(userId)) {
        const sets = row.sets.filter((s) => s.exerciseId === exerciseId);
        if (sets.length === 0) continue;
        found.set(exerciseId, { ...sets.reduce((a, b) => (b.setNumber > a.setNumber ? b : a)) });
        break;
      }
    }
    return found;
  }

  private find(userId: number, id: number) {
    return this.rows.find((row) => row.userId === userId && row.id === id);
  }

  private finishedRows(userId: number) {
    return this.rows
      .filter((row) => row.userId === userId && row.finishedAt !== null)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id - a.id);
  }

  private remove(userId: number, id: number, { finished }: { finished: boolean }) {
    const row = this.find(userId, id);
    if (!row || (row.finishedAt !== null) !== finished) return false;
    this.rows = this.rows.filter((r) => r !== row);
    return true;
  }
}

function copyInput(input: SetInput): SetInput {
  return { weightKg: input.weightKg, reps: input.reps, rpe: input.rpe, restSeconds: input.restSeconds };
}

function toSession(row: SessionRow): WorkoutSession {
  return {
    id: row.id,
    routineId: row.routineId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    notes: row.notes,
    sets: row.sets.map((set) => ({ ...set })),
  };
}
