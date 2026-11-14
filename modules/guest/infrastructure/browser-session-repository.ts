import type { LoggedSet, SetInput, WorkoutSession } from "@/modules/sessions/domain/session";
import {
  ActiveSessionExistsError,
  EmptySessionError,
  ExerciseNotAllowedError,
  LastSetOfFinishedSessionError,
  UnknownRoutineError,
  type SessionRepository,
} from "@/modules/sessions/domain/session-repository";
import { readSnapshotOrThrow, type GuestSnapshot, type GuestStorage, type StoredSession } from "../storage/guest-storage";

/**
 * SessionRepository for guests, persisted in the guest snapshot next to the
 * exercises and routines it checks. Mirrors the MySQL adapter (user-scoped
 * access, one active session per user, per-exercise set numbers, ownership
 * checks) and runs the same contract suite. Each call is one read-change-write
 * of the snapshot, and a failed check writes nothing.
 *
 * @throws GuestStorageError when the storage cannot be read or written.
 */
export class BrowserSessionRepository implements SessionRepository {
  constructor(private readonly storage: GuestStorage) {}

  async findActive(userId: number): Promise<WorkoutSession | null> {
    const row = activeRow(this.read(), userId);
    return row ? toSession(row) : null;
  }

  async findById(userId: number, id: number): Promise<WorkoutSession | null> {
    const row = find(this.read(), userId, id);
    return row ? toSession(row) : null;
  }

  async listFinished(userId: number): Promise<WorkoutSession[]> {
    return finishedRows(this.read(), userId).map(toSession);
  }

  async start(userId: number, routineId: number | null): Promise<WorkoutSession> {
    const snapshot = this.read();
    const active = activeRow(snapshot, userId);
    if (active) throw new ActiveSessionExistsError(active.id);
    if (routineId !== null) {
      const routine = snapshot.routines.find((r) => r.id === routineId && r.userId === userId);
      if (!routine || routine.archivedAt !== null) throw new UnknownRoutineError(routineId);
    }
    const row: StoredSession = {
      id: snapshot.nextIds.session++,
      userId,
      routineId,
      startedAt: new Date(),
      finishedAt: null,
      notes: null,
      sets: [],
    };
    snapshot.sessions.push(row);
    this.storage.write(snapshot);
    return toSession(row);
  }

  async addSet(userId: number, sessionId: number, exerciseId: number, input: SetInput): Promise<LoggedSet | null> {
    const snapshot = this.read();
    const row = find(snapshot, userId, sessionId);
    if (!row || row.finishedAt !== null) return null;
    const exercise = snapshot.exercises.find((e) => e.id === exerciseId && e.userId === userId);
    const earlier = row.sets.filter((s) => s.exerciseId === exerciseId);
    if (!exercise || (exercise.archivedAt !== null && earlier.length === 0)) throw new ExerciseNotAllowedError(exerciseId);
    const set: LoggedSet = {
      id: snapshot.nextIds.set++,
      exerciseId,
      setNumber: Math.max(0, ...earlier.map((s) => s.setNumber)) + 1,
      ...copyInput(input),
      completedAt: new Date(),
    };
    row.sets.push(set);
    this.storage.write(snapshot);
    return { ...set };
  }

  async updateSet(userId: number, sessionId: number, setId: number, input: SetInput): Promise<LoggedSet | null> {
    const snapshot = this.read();
    const set = find(snapshot, userId, sessionId)?.sets.find((s) => s.id === setId);
    if (!set) return null;
    Object.assign(set, copyInput(input));
    this.storage.write(snapshot);
    return { ...set };
  }

  async deleteSet(userId: number, sessionId: number, setId: number): Promise<boolean> {
    const snapshot = this.read();
    const row = find(snapshot, userId, sessionId);
    const set = row?.sets.find((s) => s.id === setId);
    if (!row || !set) return false;
    if (row.finishedAt !== null && row.sets.length === 1) throw new LastSetOfFinishedSessionError(sessionId);
    row.sets = row.sets.filter((s) => s.id !== setId);
    for (const other of row.sets) {
      if (other.exerciseId === set.exerciseId && other.setNumber > set.setNumber) other.setNumber -= 1;
    }
    this.storage.write(snapshot);
    return true;
  }

  async finish(userId: number, sessionId: number, notes: string | null): Promise<WorkoutSession | null> {
    const snapshot = this.read();
    const row = find(snapshot, userId, sessionId);
    if (!row || row.finishedAt !== null) return null;
    if (row.sets.length === 0) throw new EmptySessionError(sessionId);
    row.finishedAt = new Date();
    row.notes = notes;
    this.storage.write(snapshot);
    return toSession(row);
  }

  async discard(userId: number, sessionId: number): Promise<boolean> {
    return this.remove(userId, sessionId, { finished: false });
  }

  async deleteFinished(userId: number, sessionId: number): Promise<boolean> {
    return this.remove(userId, sessionId, { finished: true });
  }

  async lastPerformances(userId: number, exerciseIds: readonly number[]): Promise<Map<number, LoggedSet>> {
    const rows = finishedRows(this.read(), userId);
    const found = new Map<number, LoggedSet>();
    for (const exerciseId of new Set(exerciseIds)) {
      // Rows come newest first: the first session that logged it wins.
      for (const row of rows) {
        const sets = row.sets.filter((s) => s.exerciseId === exerciseId);
        if (sets.length === 0) continue;
        found.set(exerciseId, { ...sets.reduce((a, b) => (b.setNumber > a.setNumber ? b : a)) });
        break;
      }
    }
    return found;
  }

  private read(): GuestSnapshot {
    return readSnapshotOrThrow(this.storage);
  }

  private remove(userId: number, id: number, { finished }: { finished: boolean }) {
    const snapshot = this.read();
    const row = find(snapshot, userId, id);
    if (!row || (row.finishedAt !== null) !== finished) return false;
    snapshot.sessions = snapshot.sessions.filter((r) => r !== row);
    this.storage.write(snapshot);
    return true;
  }
}

function find(snapshot: GuestSnapshot, userId: number, id: number) {
  return snapshot.sessions.find((row) => row.userId === userId && row.id === id);
}

function activeRow(snapshot: GuestSnapshot, userId: number) {
  return snapshot.sessions.find((row) => row.userId === userId && row.finishedAt === null);
}

function finishedRows(snapshot: GuestSnapshot, userId: number) {
  return snapshot.sessions
    .filter((row) => row.userId === userId && row.finishedAt !== null)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id - a.id);
}

function copyInput(input: SetInput): SetInput {
  return { weightKg: input.weightKg, reps: input.reps, rpe: input.rpe, restSeconds: input.restSeconds };
}

function toSession(row: StoredSession): WorkoutSession {
  return {
    id: row.id,
    routineId: row.routineId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    notes: row.notes,
    sets: row.sets.map((set) => ({ ...set })),
  };
}
