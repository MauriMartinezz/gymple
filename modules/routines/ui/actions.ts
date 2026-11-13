"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/infrastructure/session";
import {
  archiveRoutine,
  createRoutine,
  restoreRoutine,
  updateRoutine,
  type RoutineCommandResult,
} from "../application/routine-use-cases";
import type { RoutineErrors } from "../domain/routine";
import { readRoutineForm, type RoutineFormValues } from "./parse-routine-form";
import { parseRoutineId } from "./parse-routine-id";
import { routineRepository } from "./routine-service";

export interface RoutineFormState {
  errors: RoutineErrors & { form?: string };
  values: RoutineFormValues;
}

export async function createRoutineAction(
  _prev: RoutineFormState,
  formData: FormData,
): Promise<RoutineFormState> {
  const user = await requireUser();
  const values = readRoutineForm(formData);
  const result = await createRoutine(routineRepository, user.id, values);
  return finish(result, values);
}

/** Bound to the routine id from the edit page. The repository re-checks ownership. */
export async function updateRoutineAction(
  rawId: number,
  _prev: RoutineFormState,
  formData: FormData,
): Promise<RoutineFormState> {
  const user = await requireUser();
  const values = readRoutineForm(formData);
  const id = parseRoutineId(rawId);
  const result: RoutineCommandResult = id
    ? await updateRoutine(routineRepository, user.id, id, values)
    : { ok: false, reason: "not_found" };
  return finish(result, values);
}

export async function archiveRoutineAction(formData: FormData): Promise<void> {
  await setArchived(formData, true);
}

export async function restoreRoutineAction(formData: FormData): Promise<void> {
  await setArchived(formData, false);
}

async function setArchived(formData: FormData, archived: boolean): Promise<void> {
  const user = await requireUser();
  const id = parseRoutineId(formData.get("id"));
  if (id) {
    await (archived ? archiveRoutine : restoreRoutine)(routineRepository, user.id, id);
  }
  refresh();
}

function finish(result: RoutineCommandResult, values: RoutineFormValues): RoutineFormState {
  if (result.ok) redirect("/routines");
  if (result.reason === "not_found") {
    return { errors: { form: "This routine no longer exists." }, values };
  }
  return { errors: result.errors, values };
}
