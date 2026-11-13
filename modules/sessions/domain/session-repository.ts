import type { LoggedSet, SetInput, WorkoutSession } from "./session";

/**
 * Persistence port. Every method is scoped to one user: an id that belongs to
 * another user behaves exactly like an id that does not exist, and a set id
 * that is not part of the given session behaves like a missing set.
 *
 * Only the repository can see exercises and routines, so it enforces the
 * ownership rules below and saves nothing when a check fails.
 */
export interface SessionRepository {
  /** The user's unfinished session, if any (there is at most one). */
  findActive(userId: number): Promise<WorkoutSession | null>;
  /** An active or finished session. */
  findById(userId: number, id: number): Promise<WorkoutSession | null>;
  /** Finished sessions only, newest first (start time, then id, descending). */
  listFinished(userId: number): Promise<WorkoutSession[]>;
  /**
   * Starts a free session (`routineId` null) or one from a routine the user
   * owns and has not archived. Checks the active session first.
   * @throws ActiveSessionExistsError
   * @throws UnknownRoutineError
   */
  start(userId: number, routineId: number | null): Promise<WorkoutSession>;
  /**
   * Logs a set on an active session, numbered after the exercise's last set
   * in that session. Returns null when the session does not exist or is
   * finished. The exercise must be owned by the user and active, unless it
   * already has sets in this session. @throws ExerciseNotAllowedError
   */
  addSet(userId: number, sessionId: number, exerciseId: number, input: SetInput): Promise<LoggedSet | null>;
  /**
   * Replaces a set's values (active or finished session); its exercise,
   * number and completion time stay. Returns null when the set does not exist.
   */
  updateSet(userId: number, sessionId: number, setId: number, input: SetInput): Promise<LoggedSet | null>;
  /**
   * Deletes a set (active or finished session) and renumbers the later sets
   * of the same exercise so numbers stay 1..n. Returns false when missing.
   * A finished session keeps at least one set. @throws LastSetOfFinishedSessionError
   */
  deleteSet(userId: number, sessionId: number, setId: number): Promise<boolean>;
  /**
   * Ends an active session. Returns null when the session does not exist or
   * is already finished. @throws EmptySessionError
   */
  finish(userId: number, sessionId: number, notes: string | null): Promise<WorkoutSession | null>;
  /** Deletes an active session and its sets. Returns false otherwise. */
  discard(userId: number, sessionId: number): Promise<boolean>;
  /** Deletes a finished session and its sets. Returns false otherwise. */
  deleteFinished(userId: number, sessionId: number): Promise<boolean>;
  /**
   * The last set (highest number) of the exercise in the most recent finished
   * session that logged it, in listFinished order. Active sessions are ignored.
   */
  lastPerformance(userId: number, exerciseId: number): Promise<LoggedSet | null>;
}

/** The user already has an unfinished session. */
export class ActiveSessionExistsError extends Error {
  constructor(readonly activeSessionId: number) {
    super(`Session ${activeSessionId} is still active.`);
    this.name = "ActiveSessionExistsError";
  }
}

/** The routine does not exist, belongs to another user, or is archived. */
export class UnknownRoutineError extends Error {
  constructor(readonly routineId: number) {
    super(`Routine ${routineId} cannot start a session.`);
    this.name = "UnknownRoutineError";
  }
}

/**
 * The exercise does not exist, belongs to another user, or is archived and
 * has no sets in this session yet.
 */
export class ExerciseNotAllowedError extends Error {
  constructor(readonly exerciseId: number) {
    super(`Exercise ${exerciseId} cannot be logged in this session.`);
    this.name = "ExerciseNotAllowedError";
  }
}

/** A session needs at least one set to be finished. */
export class EmptySessionError extends Error {
  constructor(readonly sessionId: number) {
    super(`Session ${sessionId} has no sets.`);
    this.name = "EmptySessionError";
  }
}

/** A finished session keeps at least one set; delete the whole session instead. */
export class LastSetOfFinishedSessionError extends Error {
  constructor(readonly sessionId: number) {
    super(`Session ${sessionId} is finished and this is its last set.`);
    this.name = "LastSetOfFinishedSessionError";
  }
}
