"use server";

import { refresh } from "next/cache";
import { parseUserId } from "@/modules/admin/ui/parse-user-id";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { parseSessionId } from "@/modules/sessions/ui/parse-session-form";
import { addComment, deleteComment, saveSuggestion, withdrawSuggestion } from "../application/feedback-use-cases";
import type { SuggestionErrors } from "../domain/feedback";
import { coachingDeps } from "./coaching-deps";

/*
 * Trainer feedback actions (S10, S12). Every action starts with
 * requireUser(): the trainer is the session user. The form only names the
 * student and the exercise, workout or comment; the use cases check the
 * link, the trainer status and ownership in the database.
 */

export interface SuggestionFormValues {
  weightKg: string;
  reps: string;
  sets: string;
  note: string;
}

export interface SuggestionFormState {
  errors: SuggestionErrors & { form?: string };
  /** The submitted values when they were rejected; null after a success. */
  values: SuggestionFormValues | null;
}

export interface CommentFormState {
  error?: string;
  /** The submitted text when it was rejected; empty after a success. */
  value: string;
}

const EXERCISE_GONE = "This exercise is no longer available.";
const WORKOUT_GONE = "This workout is no longer available.";

/** Sets or replaces the session trainer's suggestion for the student's exercise. */
export async function saveSuggestionAction(
  _prev: SuggestionFormState,
  formData: FormData,
): Promise<SuggestionFormState> {
  const user = await requireUser();
  const values: SuggestionFormValues = {
    weightKg: text(formData.get("weightKg")),
    reps: text(formData.get("reps")),
    sets: text(formData.get("sets")),
    note: text(formData.get("note")),
  };
  const studentId = parseUserId(formData.get("studentId"));
  const exerciseId = parseSessionId(formData.get("exerciseId"));
  if (!studentId || !exerciseId) return { errors: { form: EXERCISE_GONE }, values };

  const result = await saveSuggestion(coachingDeps, user.id, studentId, exerciseId, values);
  if (result.ok) {
    refresh();
    return { errors: {}, values: null };
  }
  if (result.reason === "not_found") return { errors: { form: EXERCISE_GONE }, values };
  return { errors: result.errors, values };
}

/** Withdraws the session trainer's suggestion for the student's exercise. */
export async function withdrawSuggestionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const studentId = parseUserId(formData.get("studentId"));
  const exerciseId = parseSessionId(formData.get("exerciseId"));
  if (studentId && exerciseId) await withdrawSuggestion(coachingDeps, user.id, studentId, exerciseId);
  refresh();
}

/** Adds the session trainer's comment to the student's finished workout. */
export async function addCommentAction(_prev: CommentFormState, formData: FormData): Promise<CommentFormState> {
  const user = await requireUser();
  const value = text(formData.get("body"));
  const studentId = parseUserId(formData.get("studentId"));
  const sessionId = parseSessionId(formData.get("sessionId"));
  if (!studentId || !sessionId) return { error: WORKOUT_GONE, value };

  const result = await addComment(coachingDeps, user.id, studentId, sessionId, value);
  if (result.ok) {
    refresh();
    return { value: "" };
  }
  return { error: result.reason === "invalid" ? result.error : WORKOUT_GONE, value };
}

/** Deletes the session trainer's own comment. */
export async function deleteCommentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const studentId = parseUserId(formData.get("studentId"));
  const sessionId = parseSessionId(formData.get("sessionId"));
  const commentId = parseSessionId(formData.get("commentId"));
  if (studentId && sessionId && commentId) {
    await deleteComment(coachingDeps, user.id, studentId, sessionId, commentId);
  }
  refresh();
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
