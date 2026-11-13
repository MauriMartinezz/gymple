"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  buttonClass,
  fieldErrorClass,
  inputClass,
  labelClass,
  textareaClass,
} from "@/shared/ui/styles";
import {
  EXERCISE_NAME_MAX,
  EXERCISE_NOTES_MAX,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
} from "../domain/exercise";
import type { ExerciseFormState, ExerciseFormValues } from "./actions";

interface ExerciseFormProps {
  action: (state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>;
  initialValues?: ExerciseFormValues;
  submitLabel: string;
}

const emptyValues: ExerciseFormValues = { name: "", muscleGroup: "", notes: "" };

export function ExerciseForm({ action, initialValues = emptyValues, submitLabel }: ExerciseFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    errors: {},
    values: initialValues,
  });
  const { errors, values } = state;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {errors.form && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle">
          {errors.form}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={EXERCISE_NAME_MAX}
          defaultValue={values.name}
          placeholder="e.g. Bench press"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          className={inputClass}
        />
        {errors.name && (
          <p id="name-error" className={fieldErrorClass}>
            {errors.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="muscleGroup" className={labelClass}>
          Muscle group
        </label>
        <select
          id="muscleGroup"
          name="muscleGroup"
          required
          defaultValue={values.muscleGroup}
          aria-invalid={errors.muscleGroup ? true : undefined}
          aria-describedby={errors.muscleGroup ? "muscleGroup-error" : undefined}
          className={inputClass}
        >
          <option value="" disabled>
            Choose one…
          </option>
          {MUSCLE_GROUPS.map((group) => (
            <option key={group} value={group}>
              {MUSCLE_GROUP_LABELS[group]}
            </option>
          ))}
        </select>
        {errors.muscleGroup && (
          <p id="muscleGroup-error" className={fieldErrorClass}>
            {errors.muscleGroup}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notes <span className="font-normal text-fg-subtle">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          maxLength={EXERCISE_NOTES_MAX}
          defaultValue={values.notes}
          placeholder="Grip, setup, cues…"
          aria-invalid={errors.notes ? true : undefined}
          aria-describedby={errors.notes ? "notes-error" : undefined}
          className={textareaClass}
        />
        {errors.notes && (
          <p id="notes-error" className={fieldErrorClass}>
            {errors.notes}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/exercises" className={buttonClass("secondary")}>
          Cancel
        </Link>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
