import {
  validateSessionNotes,
  validateSetInput,
  type LoggedSet,
  type RawSetInput,
  type SetErrors,
  type WorkoutSession,
} from "../domain/session";
import {
  ActiveSessionExistsError,
  EmptySessionError,
  ExerciseNotAllowedError,
  LastSetOfFinishedSessionError,
  UnknownRoutineError,
  type SessionRepository,
} from "../domain/session-repository";

export type StartSessionResult =
  | { ok: true; session: WorkoutSession }
  | { ok: false; reason: "active_exists"; error: string; activeSessionId: number }
  /** The routine is missing, another user's, or archived. */
  | { ok: false; reason: "not_found" };

export type SetCommandErrors = SetErrors & { exerciseId?: string };

export type SetCommandResult =
  | { ok: true; set: LoggedSet }
  | { ok: false; reason: "invalid"; errors: SetCommandErrors }
  | { ok: false; reason: "not_found" };

export type DeleteSetResult =
  | { ok: true }
  /** A finished session keeps at least one set. */
  | { ok: false; reason: "last_set"; error: string }
  | { ok: false; reason: "not_found" };

export interface FinishSessionErrors {
  notes?: string;
  sets?: string;
  /** Why the routine could not be updated with the session's additions. */
  routine?: string;
}

export type FinishSessionResult =
  | { ok: true; session: WorkoutSession }
  | { ok: false; reason: "invalid"; errors: FinishSessionErrors }
  | { ok: false; reason: "not_found" };

export function getActiveSession(repo: SessionRepository, userId: number) {
  return repo.findActive(userId);
}

/** Finished sessions, newest first. */
export function listHistory(repo: SessionRepository, userId: number) {
  return repo.listFinished(userId);
}

/** An active or finished session of the user. */
export function getSession(repo: SessionRepository, userId: number, id: number) {
  return repo.findById(userId, id);
}

/** For prefilling sets: each exercise's last set in the latest finished session that logged it. */
export function getLastPerformances(repo: SessionRepository, userId: number, exerciseIds: readonly number[]) {
  return repo.lastPerformances(userId, exerciseIds);
}

export async function startSession(
  repo: SessionRepository,
  userId: number,
  routineId: number | null,
): Promise<StartSessionResult> {
  try {
    return { ok: true, session: await repo.start(userId, routineId) };
  } catch (error) {
    if (error instanceof ActiveSessionExistsError) {
      return {
        ok: false,
        reason: "active_exists",
        error: "Finish or discard your current workout first.",
        activeSessionId: error.activeSessionId,
      };
    }
    if (error instanceof UnknownRoutineError) return { ok: false, reason: "not_found" };
    throw error;
  }
}

export async function logSet(
  repo: SessionRepository,
  userId: number,
  sessionId: number,
  exerciseId: number,
  raw: RawSetInput,
): Promise<SetCommandResult> {
  const validation = validateSetInput(raw);
  if (!validation.ok) return { ok: false, reason: "invalid", errors: validation.errors };

  try {
    const set = await repo.addSet(userId, sessionId, exerciseId, validation.value);
    return set ? { ok: true, set } : { ok: false, reason: "not_found" };
  } catch (error) {
    if (error instanceof ExerciseNotAllowedError) {
      return { ok: false, reason: "invalid", errors: { exerciseId: "Choose one of your exercises." } };
    }
    throw error;
  }
}

export async function editSet(
  repo: SessionRepository,
  userId: number,
  sessionId: number,
  setId: number,
  raw: RawSetInput,
): Promise<SetCommandResult> {
  const validation = validateSetInput(raw);
  if (!validation.ok) return { ok: false, reason: "invalid", errors: validation.errors };

  const set = await repo.updateSet(userId, sessionId, setId, validation.value);
  return set ? { ok: true, set } : { ok: false, reason: "not_found" };
}

export async function deleteSet(
  repo: SessionRepository,
  userId: number,
  sessionId: number,
  setId: number,
): Promise<DeleteSetResult> {
  try {
    return (await repo.deleteSet(userId, sessionId, setId)) ? { ok: true } : { ok: false, reason: "not_found" };
  } catch (error) {
    if (error instanceof LastSetOfFinishedSessionError) {
      return { ok: false, reason: "last_set", error: "Delete the whole workout instead." };
    }
    throw error;
  }
}

export async function finishSession(
  repo: SessionRepository,
  userId: number,
  sessionId: number,
  rawNotes: unknown,
): Promise<FinishSessionResult> {
  const notes = validateSessionNotes(rawNotes);
  if (!notes.ok) return { ok: false, reason: "invalid", errors: { notes: notes.error } };

  try {
    const session = await repo.finish(userId, sessionId, notes.value);
    return session ? { ok: true, session } : { ok: false, reason: "not_found" };
  } catch (error) {
    if (error instanceof EmptySessionError) {
      return { ok: false, reason: "invalid", errors: { sets: "Log at least one set before finishing." } };
    }
    throw error;
  }
}

/** Deletes the user's active session and its sets. */
export function discardSession(repo: SessionRepository, userId: number, sessionId: number) {
  return repo.discard(userId, sessionId);
}

/** Deletes one of the user's finished sessions and its sets. */
export function deleteFinishedSession(repo: SessionRepository, userId: number, sessionId: number) {
  return repo.deleteFinished(userId, sessionId);
}
