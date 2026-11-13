export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "glutes",
  "core",
  "full_body",
  "other",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  legs: "Legs",
  glutes: "Glutes",
  core: "Core",
  full_body: "Full body",
  other: "Other",
};

export const EXERCISE_NAME_MAX = 120;
export const EXERCISE_NOTES_MAX = 1000;

export interface Exercise {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  notes: string | null;
  /** Archived exercises keep their history but are hidden from pickers. */
  archivedAt: Date | null;
}

export interface ExerciseInput {
  name: string;
  muscleGroup: MuscleGroup;
  notes: string | null;
}

export type ExerciseField = keyof ExerciseInput;
export type ExerciseErrors = Partial<Record<ExerciseField, string>>;

export type ValidationResult =
  | { ok: true; value: ExerciseInput }
  | { ok: false; errors: ExerciseErrors };

export interface RawExerciseInput {
  name?: unknown;
  muscleGroup?: unknown;
  notes?: unknown;
}

export function validateExerciseInput(raw: RawExerciseInput): ValidationResult {
  const errors: ExerciseErrors = {};

  const name = asText(raw.name).replace(/\s+/g, " ");
  if (!name) errors.name = "Name is required.";
  else if (name.length > EXERCISE_NAME_MAX) {
    errors.name = `Name must be at most ${EXERCISE_NAME_MAX} characters.`;
  }

  const muscleGroup = asText(raw.muscleGroup);
  if (!isMuscleGroup(muscleGroup)) errors.muscleGroup = "Choose a muscle group.";

  const notes = asText(raw.notes);
  if (notes.length > EXERCISE_NOTES_MAX) {
    errors.notes = `Notes must be at most ${EXERCISE_NOTES_MAX} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name, muscleGroup: muscleGroup as MuscleGroup, notes: notes || null },
  };
}

export function isMuscleGroup(value: string): value is MuscleGroup {
  return (MUSCLE_GROUPS as readonly string[]).includes(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
