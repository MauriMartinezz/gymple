/** Route and form ids arrive as strings; anything but a positive integer is "not found". */
export function parseSessionId(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** What the set forms submit, kept as text so invalid input can be shown back. */
export interface SetFormValues {
  exerciseId: string;
  weightKg: string;
  reps: string;
  rpe: string;
  restSeconds: string;
}

export function readSetForm(formData: FormData): SetFormValues {
  return {
    exerciseId: text(formData, "exerciseId"),
    weightKg: text(formData, "weightKg"),
    reps: text(formData, "reps"),
    rpe: text(formData, "rpe"),
    restSeconds: text(formData, "restSeconds"),
  };
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
