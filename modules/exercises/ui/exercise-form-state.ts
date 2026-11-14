import type { ExerciseCommandResult } from "../application/exercise-use-cases";
import type { ExerciseErrors } from "../domain/exercise";

/*
 * Form parsing and result mapping shared by the server actions and the guest
 * (browser) form functions, so both show the same values and messages.
 */

export interface ExerciseFormValues {
  name: string;
  muscleGroup: string;
  notes: string;
}

export interface ExerciseFormState {
  errors: ExerciseErrors & { form?: string };
  values: ExerciseFormValues;
}

export function readExerciseForm(formData: FormData): ExerciseFormValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return { name: text("name"), muscleGroup: text("muscleGroup"), notes: text("notes") };
}

/** The state to show again for a failed command; null when it succeeded. */
export function exerciseFormStateFor(
  result: ExerciseCommandResult,
  values: ExerciseFormValues,
): ExerciseFormState | null {
  if (result.ok) return null;
  if (result.reason === "not_found") {
    return { errors: { form: "This exercise no longer exists." }, values };
  }
  return { errors: result.errors, values };
}
