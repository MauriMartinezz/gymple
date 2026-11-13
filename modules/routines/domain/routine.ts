export const ROUTINE_NAME_MAX = 120;
export const ROUTINE_DESCRIPTION_MAX = 1000;
export const ROUTINE_ITEM_NOTES_MAX = 500;
/** Keeps a single form submission bounded. */
export const ROUTINE_ITEMS_MAX = 50;

export const TARGET_SETS = { min: 1, max: 20 } as const;
export const TARGET_REPS = { min: 1, max: 100 } as const;
export const REST_SECONDS = { min: 0, max: 600 } as const;

/** One exercise slot of a routine, with its targets. */
export interface RoutineItem {
  exerciseId: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
  notes: string | null;
}

export interface Routine {
  id: number;
  name: string;
  description: string | null;
  /** In the order the user arranged them. */
  items: RoutineItem[];
  /** Archived routines are hidden from the main list but can be restored. */
  archivedAt: Date | null;
}

export type RoutineItemInput = RoutineItem;

export interface RoutineInput {
  name: string;
  description: string | null;
  items: RoutineItemInput[];
}

export type RoutineItemField = keyof RoutineItemInput;
export type RoutineItemErrors = Partial<Record<RoutineItemField, string>>;

export interface RoutineErrors {
  name?: string;
  description?: string;
  /** About the list as a whole (empty, too long). */
  items?: string;
  /** Aligned with the submitted items; `undefined` where an item is valid. */
  itemErrors?: Array<RoutineItemErrors | undefined>;
}

export type ValidationResult =
  | { ok: true; value: RoutineInput }
  | { ok: false; errors: RoutineErrors };

export interface RawRoutineItemInput {
  exerciseId?: unknown;
  targetSets?: unknown;
  targetRepsMin?: unknown;
  targetRepsMax?: unknown;
  restSeconds?: unknown;
  notes?: unknown;
}

export interface RawRoutineInput {
  name?: unknown;
  description?: unknown;
  items?: unknown;
}

export function validateRoutineInput(raw: RawRoutineInput): ValidationResult {
  const errors: RoutineErrors = {};

  const name = asText(raw.name).replace(/\s+/g, " ");
  if (!name) errors.name = "Name is required.";
  else if (name.length > ROUTINE_NAME_MAX) {
    errors.name = `Name must be at most ${ROUTINE_NAME_MAX} characters.`;
  }

  const description = asMultilineText(raw.description);
  if (description.length > ROUTINE_DESCRIPTION_MAX) {
    errors.description = `Description must be at most ${ROUTINE_DESCRIPTION_MAX} characters.`;
  }

  const rawItems = Array.isArray(raw.items) ? (raw.items as unknown[]) : [];
  const items: RoutineItemInput[] = [];
  if (rawItems.length === 0) errors.items = "Add at least one exercise.";
  else if (rawItems.length > ROUTINE_ITEMS_MAX) {
    errors.items = `A routine can have at most ${ROUTINE_ITEMS_MAX} exercises.`;
  } else {
    const itemErrors = rawItems.map((rawItem) => {
      const result = validateItem(isObject(rawItem) ? rawItem : {});
      if (result.ok) items.push(result.value);
      return result.ok ? undefined : result.errors;
    });
    if (itemErrors.some(Boolean)) errors.itemErrors = itemErrors;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, description: description || null, items } };
}

function validateItem(
  raw: RawRoutineItemInput,
): { ok: true; value: RoutineItemInput } | { ok: false; errors: RoutineItemErrors } {
  const errors: RoutineItemErrors = {};

  const exerciseId = asWholeNumber(raw.exerciseId);
  if (exerciseId === null || exerciseId < 1) errors.exerciseId = "Choose an exercise.";

  const targetSets = inRange(asWholeNumber(raw.targetSets), TARGET_SETS);
  if (targetSets === null) {
    errors.targetSets = `Sets must be a whole number from ${TARGET_SETS.min} to ${TARGET_SETS.max}.`;
  }

  const targetRepsMin = inRange(asWholeNumber(raw.targetRepsMin), TARGET_REPS);
  if (targetRepsMin === null) {
    errors.targetRepsMin = `Minimum reps must be a whole number from ${TARGET_REPS.min} to ${TARGET_REPS.max}.`;
  }

  const targetRepsMax = inRange(asWholeNumber(raw.targetRepsMax), TARGET_REPS);
  if (targetRepsMax === null) {
    errors.targetRepsMax = `Maximum reps must be a whole number from ${TARGET_REPS.min} to ${TARGET_REPS.max}.`;
  } else if (targetRepsMin !== null && targetRepsMin > targetRepsMax) {
    errors.targetRepsMax = "Maximum reps must be at least the minimum.";
  }

  const restSeconds = inRange(asWholeNumber(raw.restSeconds), REST_SECONDS);
  if (restSeconds === null) {
    errors.restSeconds = `Rest must be a whole number of seconds from ${REST_SECONDS.min} to ${REST_SECONDS.max}.`;
  }

  const notes = asMultilineText(raw.notes);
  if (notes.length > ROUTINE_ITEM_NOTES_MAX) {
    errors.notes = `Notes must be at most ${ROUTINE_ITEM_NOTES_MAX} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      exerciseId: exerciseId!,
      targetSets: targetSets!,
      targetRepsMin: targetRepsMin!,
      targetRepsMax: targetRepsMax!,
      restSeconds: restSeconds!,
      notes: notes || null,
    },
  };
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

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Browsers submit line breaks as CRLF but count them as one character.
function asMultilineText(value: unknown): string {
  return asText(value).replace(/\r\n?/g, "\n");
}

function isObject(value: unknown): value is RawRoutineItemInput {
  return typeof value === "object" && value !== null;
}
