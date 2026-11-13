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
import type { ExerciseErrors } from "../domain/exercise";
import { exerciseRepository, parseExerciseId } from "./exercise-service";

export interface ExerciseFormValues {
  name: string;
  muscleGroup: string;
  notes: string;
}

export interface ExerciseFormState {
  errors: ExerciseErrors & { form?: string };
  values: ExerciseFormValues;
}

export async function createExerciseAction(
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const user = await requireUser();
  const values = readValues(formData);
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
  const values = readValues(formData);
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
  if (result.ok) redirect("/exercises");
  if (result.reason === "not_found") {
    return { errors: { form: "This exercise no longer exists." }, values };
  }
  return { errors: result.errors, values };
}

function readValues(formData: FormData): ExerciseFormValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return { name: text("name"), muscleGroup: text("muscleGroup"), notes: text("notes") };
}
