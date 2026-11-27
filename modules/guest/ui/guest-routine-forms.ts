import { listExercises } from "@/modules/exercises/application/exercise-use-cases";
import type { ExerciseRepository } from "@/modules/exercises/domain/exercise-repository";
import {
  archiveRoutine,
  createRoutine,
  restoreRoutine,
  updateRoutine,
} from "@/modules/routines/application/routine-use-cases";
import type { RoutineRepository } from "@/modules/routines/domain/routine-repository";
import { toExerciseOptions } from "@/modules/routines/ui/exercise-options";
import { readRoutineForm } from "@/modules/routines/ui/parse-routine-form";
import { parseRoutineId } from "@/modules/routines/ui/parse-routine-id";
import type { ExerciseOption } from "@/modules/routines/ui/routine-form";
import { routineFormStateFor, type RoutineFormState } from "@/modules/routines/ui/routine-form-state";
import { GUEST_USER_ID } from "../storage/guest-storage";
import { runGuestCommand } from "./guest-command";

/*
 * Browser-side counterparts of the routine server actions: same signature,
 * same use cases and form helpers, guest repository instead of Postgres.
 */

type FormFunction = (state: RoutineFormState, formData: FormData) => Promise<RoutineFormState>;

export function guestCreateRoutine(repo: RoutineRepository, onSuccess: () => void): FormFunction {
  return async (_prev, formData) => {
    const values = readRoutineForm(formData);
    const outcome = await runGuestCommand(() => createRoutine(repo, GUEST_USER_ID, values));
    if (!outcome.ok) return { errors: { form: outcome.message }, values };
    const state = routineFormStateFor(outcome.value, values);
    if (!state) onSuccess();
    return state ?? { errors: {}, values };
  };
}

export function guestUpdateRoutine(repo: RoutineRepository, rawId: number, onSuccess: () => void): FormFunction {
  return async (_prev, formData) => {
    const values = readRoutineForm(formData);
    const id = parseRoutineId(rawId);
    const outcome = await runGuestCommand(async () =>
      id ? updateRoutine(repo, GUEST_USER_ID, id, values) : ({ ok: false, reason: "not_found" } as const),
    );
    if (!outcome.ok) return { errors: { form: outcome.message }, values };
    const state = routineFormStateFor(outcome.value, values);
    if (!state) onSuccess();
    return state ?? { errors: {}, values };
  };
}

export function guestSetRoutineArchived(
  repo: RoutineRepository,
  archived: boolean,
  onError: (message: string) => void,
): (formData: FormData) => Promise<void> {
  return async (formData) => {
    const id = parseRoutineId(formData.get("id"));
    if (!id) return;
    const outcome = await runGuestCommand(() =>
      (archived ? archiveRoutine : restoreRoutine)(repo, GUEST_USER_ID, id),
    );
    if (!outcome.ok) onError(outcome.message);
  };
}

/** Same picker choices as the signed-in pages (`loadExerciseOptions`). */
export async function loadGuestExerciseOptions(
  repo: ExerciseRepository,
  usedExerciseIds: number[] = [],
): Promise<ExerciseOption[]> {
  return toExerciseOptions(await listExercises(repo, GUEST_USER_ID), usedExerciseIds);
}
