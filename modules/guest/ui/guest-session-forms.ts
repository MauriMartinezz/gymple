import type { ExerciseRepository } from "@/modules/exercises/domain/exercise-repository";
import type { RoutineRepository } from "@/modules/routines/domain/routine-repository";
import type { SessionUnitOfWork } from "@/modules/sessions/application/session-unit-of-work";
import type { SessionRepository } from "@/modules/sessions/domain/session-repository";
import { readSetForm } from "@/modules/sessions/ui/parse-session-form";
import {
  deleteSessionFromForm,
  deleteSetFromForm,
  discardSessionFromForm,
  editSetFromForm,
  finishSessionFromForm,
  logSetFromForm,
  startSessionFromForm,
  type FormOutcome,
} from "@/modules/sessions/ui/session-form-commands";
import type {
  DeleteSetAction,
  FinishFormAction,
  SetFormAction,
  SetFormState,
  StartSessionAction,
} from "@/modules/sessions/ui/session-form-state";
import {
  exerciseNameFor,
  readActiveSession,
  readFinishView,
  readHistory,
  readSessionDetail,
} from "@/modules/sessions/ui/session-reads";
import { GUEST_USER_ID } from "../storage/guest-storage";
import { runGuestCommand } from "./guest-command";

/*
 * Browser-side counterparts of the workout server actions: same signature,
 * same use cases and form commands, guest adapters instead of Postgres. There is
 * no refresh step: every write notifies the guest storage, and the screens
 * reload from it. Guests get no trainer suggestions or comments.
 */

export interface GuestSessionDeps {
  sessions: SessionRepository;
  routines: RoutineRepository;
  exercises: ExerciseRepository;
  uow: SessionUnitOfWork;
}

export function guestStartSession({ sessions }: GuestSessionDeps, onStarted: () => void): StartSessionAction {
  return async (_prev, formData) => {
    const outcome = await runGuestCommand(() => startSessionFromForm(sessions, GUEST_USER_ID, formData));
    if (!outcome.ok) return { error: outcome.message };
    if (!outcome.value.ok) return outcome.value.state;
    onStarted();
    return {};
  };
}

export function guestLogSet({ sessions }: GuestSessionDeps): SetFormAction {
  return async (_prev, formData) =>
    setState(await runGuestCommand(() => logSetFromForm(sessions, GUEST_USER_ID, formData)), formData);
}

/** Works on active and finished workouts, so typos can be fixed. */
export function guestEditSet({ sessions }: GuestSessionDeps): SetFormAction {
  return async (_prev, formData) =>
    setState(await runGuestCommand(() => editSetFromForm(sessions, GUEST_USER_ID, formData)), formData);
}

export function guestDeleteSet({ sessions }: GuestSessionDeps): DeleteSetAction {
  return async (_prev, formData) => {
    const outcome = await runGuestCommand(() => deleteSetFromForm(sessions, GUEST_USER_ID, formData));
    if (!outcome.ok) return { error: outcome.message };
    return outcome.value.ok ? {} : outcome.value.state;
  };
}

/**
 * Finishes the active workout, with the S8 choice: `updateRoutine=yes` also
 * saves its additions to the routine, in the same snapshot write.
 */
export function guestFinishSession(
  { uow, exercises }: GuestSessionDeps,
  onFinished: (sessionId: number) => void,
): FinishFormAction {
  return async (_prev, formData) => {
    const outcome = await runGuestCommand(() =>
      finishSessionFromForm(uow, GUEST_USER_ID, formData, (exerciseId) =>
        exerciseNameFor(exercises, GUEST_USER_ID, exerciseId),
      ),
    );
    if (!outcome.ok) {
      const notes = formData.get("notes");
      return { errors: { form: outcome.message }, values: { notes: typeof notes === "string" ? notes : "" } };
    }
    if (!outcome.value.ok) return outcome.value.state;
    onFinished(outcome.value.value);
    return { errors: {}, values: { notes: "" } };
  };
}

/** Deletes the active workout and its sets. The UI asks for confirmation first. */
export function guestDiscardSession(
  { sessions }: GuestSessionDeps,
  onDone: () => void,
  onError: (message: string) => void,
): (formData: FormData) => Promise<void> {
  return async (formData) => {
    const outcome = await runGuestCommand(() => discardSessionFromForm(sessions, GUEST_USER_ID, formData));
    if (outcome.ok) onDone();
    else onError(outcome.message);
  };
}

/** Deletes a finished workout and its sets. The UI asks for confirmation first. */
export function guestDeleteSession(
  { sessions }: GuestSessionDeps,
  onDone: () => void,
  onError: (message: string) => void,
): (formData: FormData) => Promise<void> {
  return async (formData) => {
    const outcome = await runGuestCommand(() => deleteSessionFromForm(sessions, GUEST_USER_ID, formData));
    if (outcome.ok) onDone();
    else onError(outcome.message);
  };
}

/** The active workout screen; prefill comes from the guest's own history only. */
export function loadGuestActiveSession(deps: GuestSessionDeps) {
  return readActiveSession(deps, GUEST_USER_ID);
}

export function loadGuestFinishView(deps: GuestSessionDeps) {
  return readFinishView(deps, GUEST_USER_ID);
}

export function loadGuestHistory(deps: GuestSessionDeps) {
  return readHistory(deps, GUEST_USER_ID);
}

export function loadGuestSessionDetail(deps: GuestSessionDeps, id: number) {
  return readSessionDetail(deps, GUEST_USER_ID, id);
}

function setState(
  outcome: { ok: true; value: FormOutcome<SetFormState> } | { ok: false; message: string },
  formData: FormData,
): SetFormState {
  if (!outcome.ok) return { errors: { form: outcome.message }, values: readSetForm(formData) };
  return outcome.value.ok ? { errors: {}, values: null } : outcome.value.state;
}
