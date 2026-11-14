"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { parseUserId } from "@/modules/admin/ui/parse-user-id";
import { requireUser } from "@/modules/auth/infrastructure/session";
import {
  joinTrainer,
  leaveTrainer,
  regenerateInviteCode,
  removeStudent,
  type JoinResult,
} from "../application/coaching-use-cases";
import { coachingDeps } from "./coaching-deps";

/*
 * Every action starts with requireUser(): the acting user is the session
 * user. The form only names the other side (a code, a trainer or a student),
 * and the use cases check the link and the trainer status in the database.
 */

export interface JoinFormState {
  error?: string;
}

const JOIN_ERRORS: Record<Extract<JoinResult, { ok: false }>["reason"], string> = {
  unknown: "This invite link is not valid.",
  own_link: "This is your own invite link.",
  not_accepting: "This trainer is not accepting students right now.",
};

export async function joinTrainerAction(_prev: JoinFormState, formData: FormData): Promise<JoinFormState> {
  const user = await requireUser();
  const result = await joinTrainer(coachingDeps, user.id, formData.get("code"));
  if (result.ok) redirect("/trainers");
  return { error: JOIN_ERRORS[result.reason] };
}

/** The session user stops training with the trainer in `trainerId`. */
export async function leaveTrainerAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const trainerId = parseUserId(formData.get("trainerId"));
  if (trainerId) await leaveTrainer(coachingDeps, user.id, trainerId);
  refresh();
}

/** The session trainer removes the student in `studentId`. */
export async function removeStudentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const studentId = parseUserId(formData.get("studentId"));
  if (studentId) await removeStudent(coachingDeps, user.id, studentId);
  refresh();
}

/** Replaces the session trainer's invite code; the old link stops working. */
export async function regenerateInviteCodeAction(): Promise<void> {
  const user = await requireUser();
  await regenerateInviteCode(coachingDeps, user.id);
  refresh();
}
