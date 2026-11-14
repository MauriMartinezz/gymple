import {
  archiveExercise,
  createExercise,
  restoreExercise,
  updateExercise,
} from "@/modules/exercises/application/exercise-use-cases";
import type { ExerciseRepository } from "@/modules/exercises/domain/exercise-repository";
import {
  exerciseFormStateFor,
  readExerciseForm,
  type ExerciseFormState,
} from "@/modules/exercises/ui/exercise-form-state";
import { parseExerciseId } from "@/modules/exercises/ui/parse-exercise-id";
import { GUEST_USER_ID } from "../storage/guest-storage";
import { runGuestCommand } from "./guest-command";

/*
 * Browser-side counterparts of the exercise server actions: same signature,
 * same use cases and form helpers, guest repository instead of MySQL.
 * `onSuccess` navigates with the client router.
 */

type FormFunction = (state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>;

export function guestCreateExercise(repo: ExerciseRepository, onSuccess: () => void): FormFunction {
  return async (_prev, formData) => {
    const values = readExerciseForm(formData);
    const outcome = await runGuestCommand(() => createExercise(repo, GUEST_USER_ID, values));
    if (!outcome.ok) return { errors: { form: outcome.message }, values };
    const state = exerciseFormStateFor(outcome.value, values);
    if (!state) onSuccess();
    return state ?? { errors: {}, values };
  };
}

export function guestUpdateExercise(repo: ExerciseRepository, rawId: number, onSuccess: () => void): FormFunction {
  return async (_prev, formData) => {
    const values = readExerciseForm(formData);
    const id = parseExerciseId(rawId);
    const outcome = await runGuestCommand(async () =>
      id ? updateExercise(repo, GUEST_USER_ID, id, values) : ({ ok: false, reason: "not_found" } as const),
    );
    if (!outcome.ok) return { errors: { form: outcome.message }, values };
    const state = exerciseFormStateFor(outcome.value, values);
    if (!state) onSuccess();
    return state ?? { errors: {}, values };
  };
}

/** Archive or restore from the list; `onError` receives a storage failure message. */
export function guestSetExerciseArchived(
  repo: ExerciseRepository,
  archived: boolean,
  onError: (message: string) => void,
): (formData: FormData) => Promise<void> {
  return async (formData) => {
    const id = parseExerciseId(formData.get("id"));
    if (!id) return;
    const outcome = await runGuestCommand(() =>
      (archived ? archiveExercise : restoreExercise)(repo, GUEST_USER_ID, id),
    );
    if (!outcome.ok) onError(outcome.message);
  };
}
