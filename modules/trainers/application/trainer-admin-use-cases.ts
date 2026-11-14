import {
  sameEmail,
  validateCertificationInput,
  validateTrainerInput,
  type RawTrainerInput,
  type Trainer,
  type TrainerErrors,
} from "../domain/trainer";
import {
  AlreadyTrainerError,
  DniTakenError,
  EmailTakenError,
  type TrainerRepository,
} from "../domain/trainer-repository";
import type { AccountEmails } from "./account-emails";

/*
 * Admin use cases for the trainer capability (S2, S9). They assume the caller
 * already checked the admin flag: the server actions call requireAdmin()
 * before any of them.
 */

export interface TrainerAdminDeps {
  trainers: TrainerRepository;
  emails: AccountEmails;
}

export type TrainerCommandResult =
  | { ok: true; trainer: Trainer }
  | { ok: false; reason: "invalid"; errors: TrainerErrors }
  | { ok: false; reason: "not_found" }
  /** Creating a trainer for an email that already has an account: certify it instead. */
  | { ok: false; reason: "account_exists"; email: string };

const DNI_TAKEN = "Another trainer already has this DNI.";
const EMAIL_TAKEN = "Another account already uses this email.";

export function listTrainers({ trainers }: TrainerAdminDeps): Promise<Trainer[]> {
  return trainers.list();
}

export function getTrainer({ trainers }: TrainerAdminDeps, userId: number): Promise<Trainer | null> {
  return trainers.findByUserId(userId);
}

/** "Dar de alta": a new, verified account with the trainer capability and a set-password email. */
export async function createTrainer(deps: TrainerAdminDeps, raw: RawTrainerInput): Promise<TrainerCommandResult> {
  const validation = validateTrainerInput(raw);
  if (!validation.ok) return invalid(validation.errors);
  const input = validation.value;

  if (await deps.trainers.findAccountByEmail(input.email)) {
    return { ok: false, reason: "account_exists", email: input.email };
  }

  let trainer: Trainer;
  try {
    trainer = await deps.trainers.createAccountWithTrainer(input);
  } catch (error) {
    // Lost a race with a sign-up for the same email.
    if (error instanceof EmailTakenError) return { ok: false, reason: "account_exists", email: input.email };
    if (error instanceof DniTakenError) return invalid({ dni: DNI_TAKEN });
    throw error;
  }

  await sendSafely(() => deps.emails.sendSetPassword(trainer.email), "set-password");
  return { ok: true, trainer };
}

/** "Certificar": an existing account gains the trainer capability. */
export async function certifyTrainer(
  deps: TrainerAdminDeps,
  raw: { email?: unknown; dni?: unknown },
): Promise<TrainerCommandResult> {
  const validation = validateCertificationInput(raw);
  if (!validation.ok) return invalid(validation.errors);
  const { email, dni } = validation.value;

  const account = await deps.trainers.findAccountByEmail(email);
  if (!account) return invalid({ email: "No account uses this email." });
  // Anyone can sign up with someone else's address; only its owner can verify it.
  if (!account.emailVerified) return invalid({ email: "This account has not verified its email yet." });

  const existing = await deps.trainers.findByUserId(account.userId);
  if (existing) return invalid({ email: alreadyTrainerMessage(existing) });

  try {
    const trainer = await deps.trainers.certify(account.userId, dni);
    return trainer ? { ok: true, trainer } : invalid({ email: "No account uses this email." });
  } catch (error) {
    if (error instanceof DniTakenError) return invalid({ dni: DNI_TAKEN });
    if (error instanceof AlreadyTrainerError) return invalid({ email: "This account is already a trainer." });
    throw error;
  }
}

/** "Dar de baja": only the trainer capability goes; the account and its data stay (S7). */
export function revokeTrainer({ trainers }: TrainerAdminDeps, userId: number): Promise<boolean> {
  return trainers.setRevoked(userId, true);
}

/** Re-certifies a revoked trainer with the DNI already on file. */
export function restoreTrainer({ trainers }: TrainerAdminDeps, userId: number): Promise<boolean> {
  return trainers.setRevoked(userId, false);
}

/** "Editar": name, email and DNI. A new email must be verified again. */
export async function updateTrainer(
  deps: TrainerAdminDeps,
  userId: number,
  raw: RawTrainerInput,
): Promise<TrainerCommandResult> {
  const validation = validateTrainerInput(raw);
  if (!validation.ok) return invalid(validation.errors);
  const input = validation.value;

  const before = await deps.trainers.findByUserId(userId);
  if (!before) return { ok: false, reason: "not_found" };

  const emailChanged = !sameEmail(before.email, input.email);
  if (emailChanged) {
    const owner = await deps.trainers.findAccountByEmail(input.email);
    if (owner && owner.userId !== userId) return invalid({ email: EMAIL_TAKEN });
  }

  let trainer: Trainer | null;
  try {
    trainer = await deps.trainers.update(userId, input);
  } catch (error) {
    if (error instanceof EmailTakenError) return invalid({ email: EMAIL_TAKEN });
    if (error instanceof DniTakenError) return invalid({ dni: DNI_TAKEN });
    throw error;
  }
  if (!trainer) return { ok: false, reason: "not_found" };

  if (emailChanged) {
    await sendSafely(() => deps.emails.sendEmailVerification(trainer.email), "verification");
  }
  return { ok: true, trainer };
}

function alreadyTrainerMessage(trainer: Trainer): string {
  return trainer.status === "revoked"
    ? "This account is a revoked trainer. Restore it from the trainer list."
    : "This account is already a trainer.";
}

function invalid(errors: TrainerErrors): TrainerCommandResult {
  return { ok: false, reason: "invalid", errors };
}

/**
 * The account change is already saved, so a delivery failure must not undo
 * or hide it. The person can recover: request a new password link, or sign in
 * to get a new verification link.
 */
async function sendSafely(send: () => Promise<void>, kind: string): Promise<void> {
  try {
    await send();
  } catch (error) {
    console.error(`Could not send the ${kind} email:`, error);
  }
}
