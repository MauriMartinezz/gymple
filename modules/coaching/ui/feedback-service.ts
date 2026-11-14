import "server-only";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { formatDate, formatSet, plural, type PrefillSuggestion } from "@/modules/sessions/ui/session-view";
import {
  effectiveSuggestions,
  getOwnComments,
  getStudentSuggestions,
  listCommentsOnMyWorkout,
  listMySuggestions,
} from "../application/feedback-use-cases";
import type { WorkoutComment } from "../domain/feedback-repository";
import { coachingDeps } from "./coaching-deps";

/*
 * Feedback reads for pages. Each one resolves the signed-in user itself; a
 * trainer read returns null (not-found) unless that user is the student's
 * active trainer.
 */

/** The signed-in user's current suggestions from their active trainers. */
export async function loadMySuggestions() {
  const user = await requireUser();
  const suggestions = await listMySuggestions(coachingDeps, user.id);
  return suggestions.map((s) => ({
    trainerId: s.trainerId,
    trainerName: s.trainerName,
    exerciseId: s.exerciseId,
    exerciseName: s.exerciseName,
    load: formatSet(s),
    sets: s.sets === null ? null : plural(s.sets, "set"),
    note: s.note,
  }));
}

/** Per exercise, the suggestion that prefills the signed-in user's active workout. */
export async function loadMyPrefillSuggestions(): Promise<Map<number, PrefillSuggestion>> {
  const user = await requireUser();
  return effectiveSuggestions(coachingDeps, user.id);
}

/** The student's active exercises with the signed-in trainer's suggestion; null without access. */
export async function loadStudentSuggestions(studentId: number) {
  const user = await requireUser();
  const rows = await getStudentSuggestions(coachingDeps, user.id, studentId);
  if (!rows) return null;
  return rows.map(({ exercise, suggestion }) => ({
    exerciseId: exercise.id,
    name: exercise.name,
    suggestion: suggestion && {
      weightKg: suggestion.weightKg,
      reps: suggestion.reps,
      sets: suggestion.sets,
      note: suggestion.note,
      load: formatSet(suggestion),
    },
  }));
}

/** The signed-in trainer's own comments on the student's finished workout; null without access. */
export async function loadOwnWorkoutComments(studentId: number, sessionId: number) {
  const user = await requireUser();
  const comments = await getOwnComments(coachingDeps, user.id, studentId, sessionId);
  return comments && comments.map(toCommentView);
}

/** Trainers' comments on the signed-in user's own finished workout. */
export async function loadMyWorkoutComments(sessionId: number) {
  const user = await requireUser();
  return (await listCommentsOnMyWorkout(coachingDeps, user.id, sessionId)).map(toCommentView);
}

function toCommentView(comment: WorkoutComment) {
  return { id: comment.id, trainerName: comment.trainerName, date: formatDate(comment.createdAt), body: comment.body };
}
