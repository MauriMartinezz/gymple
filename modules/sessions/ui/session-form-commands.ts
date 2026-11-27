import { finishWorkout } from "../application/finish-workout-use-cases";
import type { SessionUnitOfWork } from "../application/session-unit-of-work";
import {
  deleteFinishedSession,
  deleteSet,
  discardSession,
  editSet,
  logSet,
  startSession,
  type SetCommandResult,
} from "../application/session-use-cases";
import type { SessionRepository } from "../domain/session-repository";
import { parseSessionId, readSetForm, type SetFormValues } from "./parse-session-form";
import type { DeleteSetState, FinishFormState, SetFormState, StartSessionState } from "./session-form-state";

/*
 * What each workout form does with its FormData, for one already resolved
 * user: shared by the server actions (Postgres) and the guest form functions
 * (browser storage). Success is `{ ok: true }`; the caller then navigates or
 * refreshes. Otherwise `state` is what the form shows.
 */

export type FormOutcome<S, V = undefined> = { ok: true; value: V } | { ok: false; state: S };

const NOT_ACTIVE = "This workout is no longer active.";
const SET_MISSING = "This set no longer exists.";
const CANNOT_START = "This routine can't be started.";

/** Starts a free workout, or one from the routine in the hidden `routineId` field. */
export async function startSessionFromForm(
  repo: SessionRepository,
  userId: number,
  formData: FormData,
): Promise<FormOutcome<StartSessionState>> {
  const rawRoutineId = formData.get("routineId");
  const isFree = rawRoutineId === null || rawRoutineId === "";
  const routineId = isFree ? null : parseSessionId(rawRoutineId);
  if (!isFree && routineId === null) return { ok: false, state: { error: CANNOT_START } };

  const result = await startSession(repo, userId, routineId);
  if (result.ok) return { ok: true, value: undefined };
  if (result.reason === "active_exists") {
    return { ok: false, state: { error: result.error, activeSessionId: result.activeSessionId } };
  }
  return { ok: false, state: { error: CANNOT_START } };
}

export async function logSetFromForm(
  repo: SessionRepository,
  userId: number,
  formData: FormData,
): Promise<FormOutcome<SetFormState>> {
  const values = readSetForm(formData);
  const sessionId = parseSessionId(formData.get("sessionId"));
  const exerciseId = parseSessionId(values.exerciseId);
  if (!exerciseId) return { ok: false, state: { errors: { exerciseId: "Choose one of your exercises." }, values } };

  const result: SetCommandResult = sessionId
    ? await logSet(repo, userId, sessionId, exerciseId, values)
    : { ok: false, reason: "not_found" };
  return setOutcome(result, values, NOT_ACTIVE);
}

/** Works on active and finished workouts, so typos can be fixed. */
export async function editSetFromForm(
  repo: SessionRepository,
  userId: number,
  formData: FormData,
): Promise<FormOutcome<SetFormState>> {
  const values = readSetForm(formData);
  const sessionId = parseSessionId(formData.get("sessionId"));
  const setId = parseSessionId(formData.get("setId"));

  const result: SetCommandResult =
    sessionId && setId ? await editSet(repo, userId, sessionId, setId, values) : { ok: false, reason: "not_found" };
  return setOutcome(result, values, SET_MISSING);
}

export async function deleteSetFromForm(
  repo: SessionRepository,
  userId: number,
  formData: FormData,
): Promise<FormOutcome<DeleteSetState>> {
  const sessionId = parseSessionId(formData.get("sessionId"));
  const setId = parseSessionId(formData.get("setId"));
  if (!sessionId || !setId) return { ok: false, state: { error: SET_MISSING } };

  const result = await deleteSet(repo, userId, sessionId, setId);
  if (result.ok) return { ok: true, value: undefined };
  return { ok: false, state: { error: result.reason === "last_set" ? result.error : SET_MISSING } };
}

/**
 * Finishes the active workout. The submit button the user pressed sends
 * `updateRoutine=yes` to also save the workout's additions to its routine.
 * Success carries the finished workout's id.
 */
export async function finishSessionFromForm(
  uow: SessionUnitOfWork,
  userId: number,
  formData: FormData,
  exerciseName: (exerciseId: number) => Promise<string | null>,
): Promise<FormOutcome<FinishFormState, number>> {
  const notes = formData.get("notes");
  const values = { notes: typeof notes === "string" ? notes : "" };
  const sessionId = parseSessionId(formData.get("sessionId"));
  if (!sessionId) return { ok: false, state: { errors: { form: NOT_ACTIVE }, values } };

  const result = await finishWorkout(uow, userId, sessionId, values.notes, {
    updateRoutine: formData.get("updateRoutine") === "yes",
    exerciseName,
  });
  if (result.ok) return { ok: true, value: sessionId };
  if (result.reason === "not_found") return { ok: false, state: { errors: { form: NOT_ACTIVE }, values } };
  return { ok: false, state: { errors: result.errors, values } };
}

/** Deletes the active workout in `sessionId`, if any. */
export async function discardSessionFromForm(repo: SessionRepository, userId: number, formData: FormData) {
  const sessionId = parseSessionId(formData.get("sessionId"));
  if (sessionId) await discardSession(repo, userId, sessionId);
}

/** Deletes the finished workout in `sessionId`, if any. */
export async function deleteSessionFromForm(repo: SessionRepository, userId: number, formData: FormData) {
  const sessionId = parseSessionId(formData.get("sessionId"));
  if (sessionId) await deleteFinishedSession(repo, userId, sessionId);
}

function setOutcome(result: SetCommandResult, values: SetFormValues, missing: string): FormOutcome<SetFormState> {
  if (result.ok) return { ok: true, value: undefined };
  if (result.reason === "not_found") return { ok: false, state: { errors: { form: missing }, values } };
  return { ok: false, state: { errors: result.errors, values } };
}
