import { parseDni } from "./dni";

/*
 * Roles are capabilities, not exclusive types (S7): every account is a user;
 * the trainer capability is added on top and can be revoked and restored
 * without touching the account or its own training data.
 */

export const TRAINER_NAME_MAX = 100;

export type TrainerStatus = "active" | "revoked";

/** An account, as the admin screens see it. */
export interface TrainerAccount {
  userId: number;
  name: string;
  email: string;
  emailVerified: boolean;
}

export interface Trainer extends TrainerAccount {
  dni: string;
  status: TrainerStatus;
  /** When the account first became a trainer. Restoring keeps it. */
  certifiedAt: Date;
  /** Set while the capability is revoked; null when active. */
  revokedAt: Date | null;
}

export interface TrainerInput {
  name: string;
  email: string;
  dni: string;
}

export interface CertificationInput {
  email: string;
  dni: string;
}

export type TrainerErrors = Partial<Record<keyof TrainerInput, string>>;

export type TrainerValidation = { ok: true; value: TrainerInput } | { ok: false; errors: TrainerErrors };
export type CertificationValidation =
  | { ok: true; value: CertificationInput }
  | { ok: false; errors: TrainerErrors };

export interface RawTrainerInput {
  name?: unknown;
  email?: unknown;
  dni?: unknown;
}

/** Name, email and DNI: the fields the admin types to create or edit a trainer. */
export function validateTrainerInput(raw: RawTrainerInput): TrainerValidation {
  const errors: TrainerErrors = {};

  const name = asText(raw.name).replace(/\s+/g, " ");
  if (!name) errors.name = "Name is required.";
  else if (name.length > TRAINER_NAME_MAX) errors.name = `Name must be at most ${TRAINER_NAME_MAX} characters.`;

  const certification = validateCertificationInput(raw);
  if (!certification.ok) Object.assign(errors, certification.errors);

  if (Object.keys(errors).length > 0 || !certification.ok) return { ok: false, errors };
  return { ok: true, value: { name, ...certification.value } };
}

/** Email of an existing account plus the DNI it is certified with. */
export function validateCertificationInput(raw: { email?: unknown; dni?: unknown }): CertificationValidation {
  const errors: TrainerErrors = {};

  const email = normalizeEmail(raw.email);
  if (!isEmail(email)) errors.email = "Enter a valid email address.";

  const dni = parseDni(raw.dni);
  if (!dni.ok) errors.dni = dni.error;

  if (Object.keys(errors).length > 0 || !dni.ok) return { ok: false, errors };
  return { ok: true, value: { email, dni: dni.value } };
}

/** Emails are compared case-insensitively everywhere (the users table collation is _ci). */
export function normalizeEmail(raw: unknown): string {
  return asText(raw).toLowerCase();
}

export function sameEmail(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// Same rule as the sign-up form.
function isEmail(value: string): boolean {
  return value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
