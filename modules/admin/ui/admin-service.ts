import "server-only";
import { db } from "@/infrastructure/db/client";
import { auth } from "@/modules/auth/infrastructure/better-auth";
import { AuthAccountEmails } from "@/modules/auth/infrastructure/auth-account-emails";
import { requireAdmin } from "@/modules/auth/infrastructure/session";
import { getTrainer, listTrainers, type TrainerAdminDeps } from "@/modules/trainers/application/trainer-admin-use-cases";
import { DrizzleTrainerRepository } from "@/modules/trainers/infrastructure/drizzle-trainer-repository";

export { parseUserId } from "./parse-user-id";

/** Composition root: the one place that picks the MySQL and better-auth adapters. */
export const trainerAdmin: TrainerAdminDeps = {
  trainers: new DrizzleTrainerRepository(db),
  emails: new AuthAccountEmails(auth),
};

/** Reads for admin pages. Each one checks the admin flag itself. */
export async function loadTrainers() {
  await requireAdmin();
  return listTrainers(trainerAdmin);
}

export async function loadTrainer(userId: number) {
  await requireAdmin();
  return getTrainer(trainerAdmin, userId);
}
