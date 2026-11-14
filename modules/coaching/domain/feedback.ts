import {
  asMultilineText,
  isBlank,
  parseSetReps,
  parseWeightKg,
  parseWholeNumberIn,
  SET_REPS_ERROR,
  WEIGHT_KG_ERROR,
} from "@/modules/sessions/domain/session";

/*
 * Trainer feedback (S3, S10, S12): load suggestions for a student's exercise
 * and comments on a student's finished workout. Weight and reps follow the
 * rules of a logged set; text is trimmed and CRLF counts as one character,
 * like session notes.
 */

export const SUGGESTION_SETS = { min: 1, max: 20 } as const;
export const SUGGESTION_NOTE_MAX = 500;
export const COMMENT_MAX = 1000;

export interface SuggestionInput {
  weightKg: number;
  reps: number;
  sets: number | null;
  note: string | null;
}

export interface RawSuggestionInput {
  weightKg?: unknown;
  reps?: unknown;
  sets?: unknown;
  note?: unknown;
}

export type SuggestionErrors = Partial<Record<keyof SuggestionInput, string>>;

export type SuggestionValidationResult =
  | { ok: true; value: SuggestionInput }
  | { ok: false; errors: SuggestionErrors };

export function validateSuggestionInput(raw: RawSuggestionInput): SuggestionValidationResult {
  const errors: SuggestionErrors = {};

  const weightKg = parseWeightKg(raw.weightKg);
  if (weightKg === null) errors.weightKg = WEIGHT_KG_ERROR;

  const reps = parseSetReps(raw.reps);
  if (reps === null) errors.reps = SET_REPS_ERROR;

  let sets: number | null = null;
  if (!isBlank(raw.sets)) {
    sets = parseWholeNumberIn(raw.sets, SUGGESTION_SETS);
    if (sets === null) {
      errors.sets = `Sets must be a whole number from ${SUGGESTION_SETS.min} to ${SUGGESTION_SETS.max}.`;
    }
  }

  const note = asMultilineText(raw.note);
  if (note.length > SUGGESTION_NOTE_MAX) errors.note = `Note must be at most ${SUGGESTION_NOTE_MAX} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { weightKg: weightKg!, reps: reps!, sets, note: note || null } };
}

export type CommentValidationResult = { ok: true; value: string } | { ok: false; error: string };

export function validateComment(raw: unknown): CommentValidationResult {
  const text = asMultilineText(raw);
  if (text.length === 0) return { ok: false, error: "Write a comment." };
  if (text.length > COMMENT_MAX) return { ok: false, error: `Comments must be at most ${COMMENT_MAX} characters.` };
  return { ok: true, value: text };
}
