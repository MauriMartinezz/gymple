"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { finishWorkout } from "../application/finish-workout-use-cases";
import {
  deleteFinishedSession,
  deleteSet,
  discardSession,
  editSet,
  logSet,
  startSession,
  type FinishSessionErrors,
  type SetCommandErrors,
  type SetCommandResult,
} from "../application/session-use-cases";
import { parseSessionId, readSetForm, type SetFormValues } from "./parse-session-form";
import { exerciseNameOf, sessionRepository, sessionUnitOfWork } from "./session-service";

export interface StartSessionState {
  error?: string;
  /** Set when another workout is active, to link to it. */
  activeSessionId?: number;
}

export interface SetFormState {
  errors: SetCommandErrors & { form?: string };
  /** The submitted values when they were rejected; null after a success. */
  values: SetFormValues | null;
}

export interface DeleteSetState {
  error?: string;
}

export interface FinishFormState {
  errors: FinishSessionErrors & { form?: string };
  values: { notes: string };
}

const NOT_ACTIVE = "This workout is no longer active.";
const SET_MISSING = "This set no longer exists.";

/** Starts a free workout, or one from the routine in the hidden `routineId` field. */
export async function startSessionAction(
  _prev: StartSessionState,
  formData: FormData,
): Promise<StartSessionState> {
  const user = await requireUser();
  const rawRoutineId = formData.get("routineId");
  const isFree = rawRoutineId === null || rawRoutineId === "";
  const routineId = isFree ? null : parseSessionId(rawRoutineId);
  if (!isFree && routineId === null) return { error: "This routine can't be started." };

  const result = await startSession(sessionRepository, user.id, routineId);
  if (result.ok) redirect("/sessions/active");
  if (result.reason === "active_exists") {
    return { error: result.error, activeSessionId: result.activeSessionId };
  }
  return { error: "This routine can't be started." };
}

export async function logSetAction(_prev: SetFormState, formData: FormData): Promise<SetFormState> {
  const user = await requireUser();
  const values = readSetForm(formData);
  const sessionId = parseSessionId(formData.get("sessionId"));
  const exerciseId = parseSessionId(values.exerciseId);
  if (!exerciseId) return { errors: { exerciseId: "Choose one of your exercises." }, values };

  const result: SetCommandResult = sessionId
    ? await logSet(sessionRepository, user.id, sessionId, exerciseId, values)
    : { ok: false, reason: "not_found" };
  return setResult(result, values, NOT_ACTIVE);
}

/** Works on active and finished workouts, so typos can be fixed. */
export async function editSetAction(_prev: SetFormState, formData: FormData): Promise<SetFormState> {
  const user = await requireUser();
  const values = readSetForm(formData);
  const sessionId = parseSessionId(formData.get("sessionId"));
  const setId = parseSessionId(formData.get("setId"));

  const result: SetCommandResult =
    sessionId && setId
      ? await editSet(sessionRepository, user.id, sessionId, setId, values)
      : { ok: false, reason: "not_found" };
  return setResult(result, values, SET_MISSING);
}

export async function deleteSetAction(_prev: DeleteSetState, formData: FormData): Promise<DeleteSetState> {
  const user = await requireUser();
  const sessionId = parseSessionId(formData.get("sessionId"));
  const setId = parseSessionId(formData.get("setId"));
  if (!sessionId || !setId) return { error: SET_MISSING };

  const result = await deleteSet(sessionRepository, user.id, sessionId, setId);
  if (result.ok) {
    refresh();
    return {};
  }
  return { error: result.reason === "last_set" ? result.error : SET_MISSING };
}

/**
 * Finishes the active workout. The submit button the user pressed sends
 * `updateRoutine=yes` to also save the workout's additions to its routine.
 */
export async function finishSessionAction(_prev: FinishFormState, formData: FormData): Promise<FinishFormState> {
  const user = await requireUser();
  const notes = formData.get("notes");
  const values = { notes: typeof notes === "string" ? notes : "" };
  const sessionId = parseSessionId(formData.get("sessionId"));
  if (!sessionId) return { errors: { form: NOT_ACTIVE }, values };

  const result = await finishWorkout(sessionUnitOfWork, user.id, sessionId, values.notes, {
    updateRoutine: formData.get("updateRoutine") === "yes",
    exerciseName: (exerciseId) => exerciseNameOf(user.id, exerciseId),
  });
  if (result.ok) redirect(`/sessions/${sessionId}`);
  if (result.reason === "not_found") return { errors: { form: NOT_ACTIVE }, values };
  return { errors: result.errors, values };
}

/** Deletes the active workout and its sets. The UI asks for confirmation first. */
export async function discardSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const sessionId = parseSessionId(formData.get("sessionId"));
  if (sessionId) await discardSession(sessionRepository, user.id, sessionId);
  redirect("/sessions");
}

/** Deletes a finished workout and its sets. The UI asks for confirmation first. */
export async function deleteSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const sessionId = parseSessionId(formData.get("sessionId"));
  if (sessionId) await deleteFinishedSession(sessionRepository, user.id, sessionId);
  redirect("/sessions");
}

function setResult(result: SetCommandResult, values: SetFormValues, missing: string): SetFormState {
  if (result.ok) {
    refresh();
    return { errors: {}, values: null };
  }
  if (result.reason === "not_found") return { errors: { form: missing }, values };
  return { errors: result.errors, values };
}
