"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/infrastructure/session";
import {
  deleteSessionFromForm,
  deleteSetFromForm,
  discardSessionFromForm,
  editSetFromForm,
  finishSessionFromForm,
  logSetFromForm,
  startSessionFromForm,
  type FormOutcome,
} from "./session-form-commands";
import type { DeleteSetState, FinishFormState, SetFormState, StartSessionState } from "./session-form-state";
import { exerciseNameOf, sessionRepository, sessionUnitOfWork } from "./session-service";

/*
 * Every action resolves the user from the session first; what the form does
 * is shared with guest mode (`session-form-commands`).
 */

/** Starts a free workout, or one from the routine in the hidden `routineId` field. */
export async function startSessionAction(
  _prev: StartSessionState,
  formData: FormData,
): Promise<StartSessionState> {
  const user = await requireUser();
  const outcome = await startSessionFromForm(sessionRepository, user.id, formData);
  if (outcome.ok) redirect("/sessions/active");
  return outcome.state;
}

export async function logSetAction(_prev: SetFormState, formData: FormData): Promise<SetFormState> {
  const user = await requireUser();
  return afterSetChange(await logSetFromForm(sessionRepository, user.id, formData));
}

/** Works on active and finished workouts, so typos can be fixed. */
export async function editSetAction(_prev: SetFormState, formData: FormData): Promise<SetFormState> {
  const user = await requireUser();
  return afterSetChange(await editSetFromForm(sessionRepository, user.id, formData));
}

export async function deleteSetAction(_prev: DeleteSetState, formData: FormData): Promise<DeleteSetState> {
  const user = await requireUser();
  const outcome = await deleteSetFromForm(sessionRepository, user.id, formData);
  if (!outcome.ok) return outcome.state;
  refresh();
  return {};
}

/**
 * Finishes the active workout. The submit button the user pressed sends
 * `updateRoutine=yes` to also save the workout's additions to its routine.
 */
export async function finishSessionAction(_prev: FinishFormState, formData: FormData): Promise<FinishFormState> {
  const user = await requireUser();
  const outcome = await finishSessionFromForm(sessionUnitOfWork, user.id, formData, (exerciseId) =>
    exerciseNameOf(user.id, exerciseId),
  );
  if (outcome.ok) redirect(`/sessions/${outcome.value}`);
  return outcome.state;
}

/** Deletes the active workout and its sets. The UI asks for confirmation first. */
export async function discardSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await discardSessionFromForm(sessionRepository, user.id, formData);
  redirect("/sessions");
}

/** Deletes a finished workout and its sets. The UI asks for confirmation first. */
export async function deleteSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await deleteSessionFromForm(sessionRepository, user.id, formData);
  redirect("/sessions");
}

function afterSetChange(outcome: FormOutcome<SetFormState>): SetFormState {
  if (!outcome.ok) return outcome.state;
  refresh();
  return { errors: {}, values: null };
}
