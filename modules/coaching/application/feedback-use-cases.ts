import type { ExerciseRepository } from "@/modules/exercises/domain/exercise-repository";
import type { SessionRepository } from "@/modules/sessions/domain/session-repository";
import {
  validateComment,
  validateSuggestionInput,
  type RawSuggestionInput,
  type SuggestionErrors,
} from "../domain/feedback";
import type { FeedbackRepository, LoadSuggestion, WorkoutComment } from "../domain/feedback-repository";
import { findCoachedStudent, listTrainersOf, type CoachingDeps } from "./coaching-use-cases";

/*
 * Trainer feedback (S3, S10, S12). Every trainer write and read starts with
 * `findCoachedStudent` (link + active trainer, S7), then checks that the
 * exercise or workout belongs to that student. Anything that fails a check
 * is reported as missing and changes nothing.
 *
 * Students see suggestions only from their active trainers (a revoked or
 * former trainer's suggestions stop applying and are hidden), while comments
 * stay readable whatever the trainer's status.
 */

export interface FeedbackDeps extends CoachingDeps {
  feedback: FeedbackRepository;
  exercises: Pick<ExerciseRepository, "findById" | "list">;
  sessions: Pick<SessionRepository, "findById">;
  /** Defaults to the current time. */
  now?: () => Date;
}

export type SaveSuggestionResult =
  | { ok: true }
  | { ok: false; reason: "invalid"; errors: SuggestionErrors }
  /** Not the student's active trainer, or not the student's active exercise. */
  | { ok: false; reason: "not_found" };

export type AddCommentResult =
  | { ok: true; comment: WorkoutComment }
  | { ok: false; reason: "invalid"; error: string }
  /** Not the student's active trainer, or not the student's finished workout. */
  | { ok: false; reason: "not_found" };

export interface ExerciseSuggestionRow {
  exercise: { id: number; name: string };
  /** This trainer's current suggestion, if any. */
  suggestion: LoadSuggestion | null;
}

export interface MySuggestion extends LoadSuggestion {
  exerciseName: string;
}

/** Sets or replaces the trainer's suggestion for one of the student's active exercises. Never touches routines. */
export async function saveSuggestion(
  deps: FeedbackDeps,
  trainerId: number,
  studentId: number,
  exerciseId: number,
  raw: RawSuggestionInput,
): Promise<SaveSuggestionResult> {
  const student = await findCoachedStudent(deps, trainerId, studentId);
  if (!student) return { ok: false, reason: "not_found" };
  // Scoped to the student: another user's exercise id is missing here.
  const exercise = await deps.exercises.findById(student.userId, exerciseId);
  if (!exercise || exercise.archivedAt !== null) return { ok: false, reason: "not_found" };

  const input = validateSuggestionInput(raw);
  if (!input.ok) return { ok: false, reason: "invalid", errors: input.errors };

  await deps.feedback.saveSuggestion({
    trainerId,
    studentId: student.userId,
    exerciseId: exercise.id,
    ...input.value,
    suggestedAt: now(deps),
  });
  return { ok: true };
}

/** The active trainer withdraws their suggestion. False when there was none or access is refused. */
export async function withdrawSuggestion(
  deps: FeedbackDeps,
  trainerId: number,
  studentId: number,
  exerciseId: number,
): Promise<boolean> {
  const student = await findCoachedStudent(deps, trainerId, studentId);
  if (!student) return false;
  return deps.feedback.deleteSuggestion(trainerId, student.userId, exerciseId);
}

/** The student's active exercises, by name, with this trainer's suggestion; null without access. */
export async function getStudentSuggestions(
  deps: FeedbackDeps,
  trainerId: number,
  studentId: number,
): Promise<ExerciseSuggestionRow[] | null> {
  const student = await findCoachedStudent(deps, trainerId, studentId);
  if (!student) return null;

  const [exercises, suggestions] = await Promise.all([
    deps.exercises.list(student.userId, { archived: false }),
    deps.feedback.listSuggestionsForStudent(student.userId),
  ]);
  const own = new Map(suggestions.filter((s) => s.trainerId === trainerId).map((s) => [s.exerciseId, s]));
  return [...exercises]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ exercise: { id: e.id, name: e.name }, suggestion: own.get(e.id) ?? null }));
}

/** Suggestions from the student's active trainers, most recent first, with the exercise name. */
export async function listMySuggestions(deps: FeedbackDeps, studentId: number): Promise<MySuggestion[]> {
  const [suggestions, active, archived] = await Promise.all([
    activeSuggestions(deps, studentId),
    deps.exercises.list(studentId, { archived: false }),
    deps.exercises.list(studentId, { archived: true }),
  ]);
  const names = new Map([...active, ...archived].map((e) => [e.id, e.name]));
  return suggestions.flatMap((s) => {
    const exerciseName = names.get(s.exerciseId);
    return exerciseName === undefined ? [] : [{ ...s, exerciseName }];
  });
}

/** Per exercise, the most recent suggestion among the student's active trainers (S10). */
export async function effectiveSuggestions(deps: FeedbackDeps, studentId: number): Promise<Map<number, LoadSuggestion>> {
  const effective = new Map<number, LoadSuggestion>();
  for (const suggestion of await activeSuggestions(deps, studentId)) {
    if (!effective.has(suggestion.exerciseId)) effective.set(suggestion.exerciseId, suggestion);
  }
  return effective;
}

/** Adds the active trainer's comment to one of the student's finished workouts. */
export async function addComment(
  deps: FeedbackDeps,
  trainerId: number,
  studentId: number,
  sessionId: number,
  raw: unknown,
): Promise<AddCommentResult> {
  const sessionOk = await coachedFinishedWorkout(deps, trainerId, studentId, sessionId);
  if (!sessionOk) return { ok: false, reason: "not_found" };

  const body = validateComment(raw);
  if (!body.ok) return { ok: false, reason: "invalid", error: body.error };

  const comment = await deps.feedback.addComment({ sessionId, trainerId, body: body.value, createdAt: now(deps) });
  return { ok: true, comment };
}

/** The active trainer deletes their own comment on the student's workout. */
export async function deleteComment(
  deps: FeedbackDeps,
  trainerId: number,
  studentId: number,
  sessionId: number,
  commentId: number,
): Promise<boolean> {
  if (!(await coachedFinishedWorkout(deps, trainerId, studentId, sessionId))) return false;
  return deps.feedback.deleteComment(trainerId, sessionId, commentId);
}

/** The trainer's own comments on the student's finished workout; null without access. */
export async function getOwnComments(
  deps: FeedbackDeps,
  trainerId: number,
  studentId: number,
  sessionId: number,
): Promise<WorkoutComment[] | null> {
  if (!(await coachedFinishedWorkout(deps, trainerId, studentId, sessionId))) return null;
  return (await deps.feedback.listComments(sessionId)).filter((c) => c.trainerId === trainerId);
}

/** Every trainer's comments on the student's own finished workout, revoked trainers included (S7). */
export async function listCommentsOnMyWorkout(
  deps: FeedbackDeps,
  studentId: number,
  sessionId: number,
): Promise<WorkoutComment[]> {
  const session = await deps.sessions.findById(studentId, sessionId);
  if (!session || session.finishedAt === null) return [];
  return deps.feedback.listComments(session.id);
}

async function activeSuggestions(deps: FeedbackDeps, studentId: number): Promise<LoadSuggestion[]> {
  const [trainers, suggestions] = await Promise.all([
    listTrainersOf(deps, studentId),
    deps.feedback.listSuggestionsForStudent(studentId),
  ]);
  const active = new Set(trainers.filter((t) => t.status === "active").map((t) => t.userId));
  return suggestions.filter((s) => active.has(s.trainerId));
}

async function coachedFinishedWorkout(
  deps: FeedbackDeps,
  trainerId: number,
  studentId: number,
  sessionId: number,
): Promise<boolean> {
  const student = await findCoachedStudent(deps, trainerId, studentId);
  if (!student) return false;
  // Scoped to the student: another user's session id is missing here.
  const session = await deps.sessions.findById(student.userId, sessionId);
  return session !== null && session.finishedAt !== null;
}

function now(deps: FeedbackDeps): Date {
  return deps.now?.() ?? new Date();
}
