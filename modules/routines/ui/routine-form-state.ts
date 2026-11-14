import type { RoutineCommandResult } from "../application/routine-use-cases";
import type { RoutineErrors } from "../domain/routine";
import type { RoutineFormValues } from "./parse-routine-form";

/** Result mapping shared by the server actions and the guest (browser) form functions. */

export interface RoutineFormState {
  errors: RoutineErrors & { form?: string };
  values: RoutineFormValues;
}

/** The state to show again for a failed command; null when it succeeded. */
export function routineFormStateFor(
  result: RoutineCommandResult,
  values: RoutineFormValues,
): RoutineFormState | null {
  if (result.ok) return null;
  if (result.reason === "not_found") {
    return { errors: { form: "This routine no longer exists." }, values };
  }
  return { errors: result.errors, values };
}
