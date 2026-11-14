"use client";

import { useActionState } from "react";
import { fieldErrorClass, inputClass, labelClass, textareaClass, buttonClass } from "@/shared/ui/styles";
import { SUGGESTION_NOTE_MAX } from "../domain/feedback";
import { saveSuggestionAction, type SuggestionFormState, type SuggestionFormValues } from "./feedback-actions";

/** Sets or replaces the trainer's load suggestion for one of the student's exercises. */
export function SuggestionForm({
  studentId,
  exerciseId,
  exerciseName,
  current,
}: {
  studentId: number;
  exerciseId: number;
  exerciseName: string;
  current: SuggestionFormValues | null;
}) {
  const [state, formAction, pending] = useActionState(saveSuggestionAction, {
    errors: {},
    values: null,
  } as SuggestionFormState);
  const values = state.values ?? current ?? { weightKg: "", reps: "", sets: "", note: "" };
  const id = (field: string) => `suggestion-${exerciseId}-${field}`;
  const error = (field: keyof SuggestionFormValues) =>
    state.errors[field] && (
      <p id={id(`${field}-error`)} className={fieldErrorClass}>
        {state.errors[field]}
      </p>
    );

  return (
    // Remounted by the parent after a save so the fields show the stored values.
    <form action={formAction} className="flex flex-col gap-3" aria-label={`Suggestion for ${exerciseName}`}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="exerciseId" value={exerciseId} />
      {state.errors.form && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle">
          {state.errors.form}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("weightKg")} className={labelClass}>
            Weight (kg)
          </label>
          <input
            id={id("weightKg")}
            name="weightKg"
            inputMode="decimal"
            required
            defaultValue={values.weightKg}
            aria-invalid={state.errors.weightKg ? true : undefined}
            aria-describedby={state.errors.weightKg ? id("weightKg-error") : undefined}
            className={inputClass}
          />
          {error("weightKg")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("reps")} className={labelClass}>
            Reps
          </label>
          <input
            id={id("reps")}
            name="reps"
            inputMode="numeric"
            required
            defaultValue={values.reps}
            aria-invalid={state.errors.reps ? true : undefined}
            aria-describedby={state.errors.reps ? id("reps-error") : undefined}
            className={inputClass}
          />
          {error("reps")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("sets")} className={labelClass}>
            Sets <span className="font-normal text-fg-subtle">(optional)</span>
          </label>
          <input
            id={id("sets")}
            name="sets"
            inputMode="numeric"
            defaultValue={values.sets}
            aria-invalid={state.errors.sets ? true : undefined}
            aria-describedby={state.errors.sets ? id("sets-error") : undefined}
            className={inputClass}
          />
          {error("sets")}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("note")} className={labelClass}>
          Note <span className="font-normal text-fg-subtle">(optional)</span>
        </label>
        <textarea
          id={id("note")}
          name="note"
          maxLength={SUGGESTION_NOTE_MAX}
          defaultValue={values.note}
          aria-invalid={state.errors.note ? true : undefined}
          aria-describedby={state.errors.note ? id("note-error") : undefined}
          className={textareaClass}
        />
        {error("note")}
      </div>
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
          {pending ? "Saving…" : current ? "Replace suggestion" : "Suggest"}
          <span className="sr-only"> for {exerciseName}</span>
        </button>
      </div>
    </form>
  );
}
