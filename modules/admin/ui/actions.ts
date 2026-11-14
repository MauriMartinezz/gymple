"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/modules/auth/infrastructure/session";
import {
  certifyTrainer,
  createTrainer,
  restoreTrainer,
  revokeTrainer,
  updateTrainer,
  type TrainerCommandResult,
} from "@/modules/trainers/application/trainer-admin-use-cases";
import type { TrainerErrors } from "@/modules/trainers/domain/trainer";
import { trainerAdmin } from "./admin-service";
import { parseUserId } from "./parse-user-id";

/*
 * Every action starts with requireAdmin(): it reads the admin flag from the
 * database for the session user. Nothing in the form decides who may act.
 */

export interface TrainerFormValues {
  name: string;
  email: string;
  dni: string;
}

export interface TrainerFormState {
  errors: TrainerErrors & { form?: string };
  values: TrainerFormValues;
  /** Set when the email already has an account: the form links to certifying it. */
  certifyEmail?: string;
}

export interface CertifyFormValues {
  email: string;
  dni: string;
}

export interface CertifyFormState {
  errors: Omit<TrainerErrors, "name"> & { form?: string };
  values: CertifyFormValues;
}

export async function createTrainerAction(_prev: TrainerFormState, formData: FormData): Promise<TrainerFormState> {
  await requireAdmin();
  const values = readTrainerValues(formData);
  const result = await createTrainer(trainerAdmin, values);
  if (result.ok) redirect("/admin");
  if (result.reason === "account_exists") {
    return {
      errors: { form: "An account already uses this email. Certify it as a trainer instead." },
      values,
      certifyEmail: result.email,
    };
  }
  return { errors: formErrors(result), values };
}

export async function certifyTrainerAction(_prev: CertifyFormState, formData: FormData): Promise<CertifyFormState> {
  await requireAdmin();
  const values = { email: text(formData, "email"), dni: text(formData, "dni") };
  const result = await certifyTrainer(trainerAdmin, values);
  if (result.ok) redirect("/admin");
  return { errors: formErrors(result), values };
}

/** Bound to the trainer's user id from the edit page. */
export async function updateTrainerAction(
  rawUserId: number,
  _prev: TrainerFormState,
  formData: FormData,
): Promise<TrainerFormState> {
  await requireAdmin();
  const values = readTrainerValues(formData);
  const userId = parseUserId(rawUserId);
  const result: TrainerCommandResult = userId
    ? await updateTrainer(trainerAdmin, userId, values)
    : { ok: false, reason: "not_found" };
  if (result.ok) redirect("/admin");
  return { errors: formErrors(result), values };
}

export async function revokeTrainerAction(formData: FormData): Promise<void> {
  await setRevoked(formData, true);
}

export async function restoreTrainerAction(formData: FormData): Promise<void> {
  await setRevoked(formData, false);
}

async function setRevoked(formData: FormData, revoked: boolean): Promise<void> {
  await requireAdmin();
  const userId = parseUserId(formData.get("userId"));
  if (userId) await (revoked ? revokeTrainer : restoreTrainer)(trainerAdmin, userId);
  refresh();
}

function formErrors(result: Exclude<TrainerCommandResult, { ok: true }>): TrainerFormState["errors"] {
  switch (result.reason) {
    case "invalid":
      return result.errors;
    case "not_found":
      return { form: "This trainer no longer exists." };
    case "account_exists":
      return { form: "An account already uses this email." };
  }
}

function readTrainerValues(formData: FormData): TrainerFormValues {
  return { name: text(formData, "name"), email: text(formData, "email"), dni: text(formData, "dni") };
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
