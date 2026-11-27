import { isMuscleGroup, type Exercise } from "@/modules/exercises/domain/exercise";
import type { Routine, RoutineItem } from "@/modules/routines/domain/routine";
import type { LoggedSet, WorkoutSession } from "@/modules/sessions/domain/session";

/*
 * Guest data lives only in the browser (S5): one versioned snapshot under one
 * key. Rows keep a userId so the browser adapters stay user-scoped like the
 * Postgres ones; guest pages always use GUEST_USER_ID.
 */

export const GUEST_STORAGE_KEY = "gymple.guest";
export const GUEST_SNAPSHOT_VERSION = 1;
/** The one local user every guest page acts as. */
export const GUEST_USER_ID = 1;

export type StoredExercise = Exercise & { userId: number };
export type StoredRoutine = Routine & { userId: number };
export type StoredSession = WorkoutSession & { userId: number };

export interface GuestSnapshot {
  version: typeof GUEST_SNAPSHOT_VERSION;
  /** Next id per collection (sets are numbered across all sessions). */
  nextIds: { exercise: number; routine: number; session: number; set: number };
  exercises: StoredExercise[];
  routines: StoredRoutine[];
  /**
   * Workouts, added after the first release of version 1: a snapshot saved
   * before them has no `sessions` and reads as having none, so the version
   * did not change.
   */
  sessions: StoredSession[];
}

export type GuestStorageFailure = "unavailable" | "corrupted" | "unsupported_version" | "quota_exceeded";

export type GuestReadResult =
  | { ok: true; snapshot: GuestSnapshot }
  | { ok: false; reason: Exclude<GuestStorageFailure, "quota_exceeded"> };

/** Storage port for the guest snapshot. Reads never throw; writes throw GuestStorageError. */
export interface GuestStorage {
  read(): GuestReadResult;
  /** @throws GuestStorageError ("unavailable" or "quota_exceeded"); nothing changes then. */
  write(snapshot: GuestSnapshot): void;
  /** Deletes every guest record. @throws GuestStorageError */
  clear(): void;
  /** Called after any change, including from other tabs where supported. */
  subscribe(listener: () => void): () => void;
}

export const GUEST_STORAGE_MESSAGES: Record<GuestStorageFailure, string> = {
  unavailable:
    "This browser is not letting Gymple save data (for example in a private window), so guest data cannot be saved here. Allow site data or create an account.",
  quota_exceeded:
    "This browser's storage for Gymple is full, so the change was not saved. Delete guest data or create an account.",
  corrupted: "The guest data saved in this browser could not be read.",
  unsupported_version:
    "The guest data saved in this browser comes from a different version of Gymple and cannot be read.",
};

export class GuestStorageError extends Error {
  constructor(readonly reason: GuestStorageFailure) {
    super(GUEST_STORAGE_MESSAGES[reason]);
    this.name = "GuestStorageError";
  }
}

export function emptyGuestSnapshot(): GuestSnapshot {
  return {
    version: GUEST_SNAPSHOT_VERSION,
    nextIds: { exercise: 1, routine: 1, session: 1, set: 1 },
    exercises: [],
    routines: [],
    sessions: [],
  };
}

/** Reads the snapshot or throws the read failure; what the repositories need. */
export function readSnapshotOrThrow(storage: GuestStorage): GuestSnapshot {
  const result = storage.read();
  if (!result.ok) throw new GuestStorageError(result.reason);
  return result.snapshot;
}

export function serializeSnapshot(snapshot: GuestSnapshot): string {
  return JSON.stringify(snapshot);
}

/** Parses stored text; anything unexpected is "corrupted", never a crash. */
export function parseSnapshot(text: string): GuestReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "corrupted" };
  }
  if (!isRecord(raw)) return { ok: false, reason: "corrupted" };
  if (raw.version !== GUEST_SNAPSHOT_VERSION) {
    return { ok: false, reason: typeof raw.version === "number" ? "unsupported_version" : "corrupted" };
  }
  try {
    const empty = emptyGuestSnapshot();
    const nextIds = raw.nextIds === undefined ? {} : raw.nextIds;
    if (!isRecord(nextIds)) throw new SyntaxError("nextIds");
    const exercises = arrayOf(raw.exercises, toExercise);
    const routines = arrayOf(raw.routines, toRoutine);
    const sessions = arrayOf(raw.sessions, toSession);
    return {
      ok: true,
      snapshot: {
        version: GUEST_SNAPSHOT_VERSION,
        nextIds: {
          exercise: nextId(nextIds.exercise, exercises, empty.nextIds.exercise),
          routine: nextId(nextIds.routine, routines, empty.nextIds.routine),
          session: nextId(nextIds.session, sessions, empty.nextIds.session),
          set: nextId(nextIds.set, sessions.flatMap((session) => session.sets), empty.nextIds.set),
        },
        exercises,
        routines,
        sessions,
      },
    };
  } catch {
    return { ok: false, reason: "corrupted" };
  }
}

function arrayOf<T>(value: unknown, map: (row: unknown) => T): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new SyntaxError("collection");
  return value.map(map);
}

/** Never hands out an id already in use, even if the counter was lost. */
function nextId(value: unknown, rows: Array<{ id: number }>, fallback: number): number {
  const counter = isPositiveInt(value) ? value : fallback;
  return Math.max(counter, ...rows.map((row) => row.id + 1));
}

function toExercise(row: unknown): StoredExercise {
  if (!isRecord(row) || !isPositiveInt(row.id) || !isPositiveInt(row.userId)) throw new SyntaxError("exercise");
  if (typeof row.name !== "string" || typeof row.muscleGroup !== "string" || !isMuscleGroup(row.muscleGroup)) {
    throw new SyntaxError("exercise");
  }
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    muscleGroup: row.muscleGroup,
    notes: nullableText(row.notes),
    archivedAt: nullableDate(row.archivedAt),
  };
}

function toRoutine(row: unknown): StoredRoutine {
  if (!isRecord(row) || !isPositiveInt(row.id) || !isPositiveInt(row.userId) || typeof row.name !== "string") {
    throw new SyntaxError("routine");
  }
  if (!Array.isArray(row.items)) throw new SyntaxError("routine items");
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: nullableText(row.description),
    items: row.items.map(toRoutineItem),
    archivedAt: nullableDate(row.archivedAt),
  };
}

function toRoutineItem(item: unknown): RoutineItem {
  if (!isRecord(item)) throw new SyntaxError("item");
  const numbers = ["exerciseId", "targetSets", "targetRepsMin", "targetRepsMax", "restSeconds"] as const;
  for (const key of numbers) {
    if (!Number.isSafeInteger(item[key])) throw new SyntaxError("item");
  }
  return {
    exerciseId: item.exerciseId as number,
    targetSets: item.targetSets as number,
    targetRepsMin: item.targetRepsMin as number,
    targetRepsMax: item.targetRepsMax as number,
    restSeconds: item.restSeconds as number,
    notes: nullableText(item.notes),
  };
}

function toSession(row: unknown): StoredSession {
  if (!isRecord(row) || !isPositiveInt(row.id) || !isPositiveInt(row.userId)) throw new SyntaxError("session");
  if (row.routineId !== null && !isPositiveInt(row.routineId)) throw new SyntaxError("session routine");
  if (!Array.isArray(row.sets)) throw new SyntaxError("session sets");
  return {
    id: row.id,
    userId: row.userId,
    routineId: row.routineId,
    startedAt: requiredDate(row.startedAt),
    finishedAt: nullableDate(row.finishedAt),
    notes: nullableText(row.notes),
    sets: row.sets.map(toLoggedSet),
  };
}

function toLoggedSet(row: unknown): LoggedSet {
  if (!isRecord(row) || !isPositiveInt(row.id) || !isPositiveInt(row.exerciseId) || !isPositiveInt(row.setNumber)) {
    throw new SyntaxError("set");
  }
  if (!isFiniteNumber(row.weightKg) || !isPositiveInt(row.reps)) throw new SyntaxError("set");
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    setNumber: row.setNumber,
    weightKg: row.weightKg,
    reps: row.reps,
    rpe: nullableNumber(row.rpe),
    restSeconds: nullableNumber(row.restSeconds),
    completedAt: requiredDate(row.completedAt),
  };
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (!isFiniteNumber(value)) throw new SyntaxError("number");
  return value;
}

function requiredDate(value: unknown): Date {
  const date = nullableDate(value);
  if (!date) throw new SyntaxError("date");
  return date;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new SyntaxError("text");
  return value;
}

function nullableDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new SyntaxError("date");
  return date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
