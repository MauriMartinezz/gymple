export const SESSION_NOTES_MAX = 1000;

export const WEIGHT_KG = { min: 0, max: 999.99 } as const;
export const SET_REPS = { min: 1, max: 100 } as const;
/** Rate of perceived exertion, in steps of 0.5. */
export const RPE = { min: 1, max: 10 } as const;
export const SET_REST_SECONDS = { min: 0, max: 600 } as const;

/** A performed set. Set numbers count per exercise within a session, from 1. */
export interface LoggedSet {
  id: number;
  exerciseId: number;
  setNumber: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  restSeconds: number | null;
  completedAt: Date;
}

/** The "execution" of a routine, or a free workout when `routineId` is null. */
export interface WorkoutSession {
  id: number;
  routineId: number | null;
  startedAt: Date;
  /** Null while the session is active. */
  finishedAt: Date | null;
  notes: string | null;
  /** In the order they were logged. */
  sets: LoggedSet[];
}

export interface SetInput {
  weightKg: number;
  reps: number;
  rpe: number | null;
  restSeconds: number | null;
}

export type SetField = keyof SetInput;
export type SetErrors = Partial<Record<SetField, string>>;

export type SetValidationResult = { ok: true; value: SetInput } | { ok: false; errors: SetErrors };

export interface RawSetInput {
  weightKg?: unknown;
  reps?: unknown;
  rpe?: unknown;
  restSeconds?: unknown;
}

export function validateSetInput(raw: RawSetInput): SetValidationResult {
  const errors: SetErrors = {};

  const weightKg = inRange(asDecimal(raw.weightKg, 3, 2), WEIGHT_KG);
  if (weightKg === null) {
    errors.weightKg = `Weight must be a number from ${WEIGHT_KG.min} to ${WEIGHT_KG.max} kg with at most 2 decimals.`;
  }

  const reps = inRange(asWholeNumber(raw.reps), SET_REPS);
  if (reps === null) errors.reps = `Reps must be a whole number from ${SET_REPS.min} to ${SET_REPS.max}.`;

  let rpe: number | null = null;
  if (!isBlank(raw.rpe)) {
    rpe = inRange(asDecimal(raw.rpe, 2, 2), RPE);
    if (rpe === null || !Number.isInteger(rpe * 2)) {
      errors.rpe = `RPE must be a number from ${RPE.min} to ${RPE.max} in steps of 0.5.`;
    }
  }

  let restSeconds: number | null = null;
  if (!isBlank(raw.restSeconds)) {
    restSeconds = inRange(asWholeNumber(raw.restSeconds), SET_REST_SECONDS);
    if (restSeconds === null) {
      errors.restSeconds = `Rest must be a whole number of seconds from ${SET_REST_SECONDS.min} to ${SET_REST_SECONDS.max}.`;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { weightKg: weightKg!, reps: reps!, rpe, restSeconds } };
}

export type NotesValidationResult = { ok: true; value: string | null } | { ok: false; error: string };

export function validateSessionNotes(raw: unknown): NotesValidationResult {
  const notes = asMultilineText(raw);
  if (notes.length > SESSION_NOTES_MAX) {
    return { ok: false, error: `Notes must be at most ${SESSION_NOTES_MAX} characters.` };
  }
  return { ok: true, value: notes || null };
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Strict: plain digits with an optional fraction, so "1e3", "-1", ".5", "80."
 * and "80,5" are rejected, as is any number written with more decimals.
 */
function asDecimal(value: unknown, maxIntegerDigits: number, maxDecimals: number): number | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim();
  } else {
    return null;
  }
  const pattern = new RegExp(`^\\d{1,${maxIntegerDigits}}(\\.\\d{1,${maxDecimals}})?$`);
  return pattern.test(text) ? Number(text) : null;
}

/** Strict: only plain digits (or an integer number), so "1e3", "2.5" and "" are rejected. */
function asWholeNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{1,9}$/.test(text)) return null;
  return Number(text);
}

function inRange(value: number | null, range: { min: number; max: number }): number | null {
  return value !== null && value >= range.min && value <= range.max ? value : null;
}

// Browsers submit line breaks as CRLF but count them as one character.
function asMultilineText(value: unknown): string {
  return (typeof value === "string" ? value.trim() : "").replace(/\r\n?/g, "\n");
}
