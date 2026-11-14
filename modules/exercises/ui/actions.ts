"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/infrastructure/session";
import {
  archiveExercise,
  createExercise,
  restoreExercise,
  updateExercise,
  type ExerciseCommandResult,
} from "../application/exercise-use-cases";
import {
  exerciseFormStateFor,
  readExerciseForm,
  type ExerciseFormState,
  type ExerciseFormValues,
} from "./exercise-form-state";
import { exerciseRepository } from "./exercise-service";
import { parseExerciseId } from "./parse-exercise-id";

export type { ExerciseFormState, ExerciseFormValues } from "./exercise-form-state";

export async function createExerciseAction(
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const user = await requireUser();
  const values = readExerciseForm(formData);
  const result = await createExercise(exerciseRepository, user.id, values);
  return finish(result, values);
}

/** Bound to the exercise id from the edit page. The repository re-checks ownership. */
export async function updateExerciseAction(
  rawId: number,
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const user = await requireUser();
  const values = readExerciseForm(formData);
  const id = parseExerciseId(rawId);
  const result: ExerciseCommandResult = id
    ? await updateExercise(exerciseRepository, user.id, id, values)
    : { ok: false, reason: "not_found" };
  return finish(result, values);
}

export async function archiveExerciseAction(formData: FormData): Promise<void> {
  await setArchived(formData, true);
}

export async function restoreExerciseAction(formData: FormData): Promise<void> {
  await setArchived(formData, false);
}

async function setArchived(formData: FormData, archived: boolean): Promise<void> {
  const user = await requireUser();
  const id = parseExerciseId(formData.get("id"));
  if (id) {
    await (archived ? archiveExercise : restoreExercise)(exerciseRepository, user.id, id);
  }
  refresh();
}

function finish(result: ExerciseCommandResult, values: ExerciseFormValues): ExerciseFormState {
  const state = exerciseFormStateFor(result, values);
  if (!state) redirect("/exercises");
  return state;
}
