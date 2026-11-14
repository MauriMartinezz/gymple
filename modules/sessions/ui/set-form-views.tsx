"use client";

import { useActionState, useState } from "react";
import { buttonClass, fieldErrorClass, inputClass, labelClass } from "@/shared/ui/styles";
import { RPE, SET_REPS, SET_REST_SECONDS, WEIGHT_KG, type LoggedSet } from "../domain/session";
import type { SetFormValues } from "./parse-session-form";
import type { DeleteSetAction, DeleteSetState, SetFormAction, SetFormState } from "./session-form-state";
import type { SetPrefill } from "./session-view";

type SetField = "weightKg" | "reps" | "rpe" | "restSeconds";

const fields = [
  { field: "weightKg", label: "Weight (kg)", inputMode: "decimal", range: WEIGHT_KG, step: 0.01 },
  { field: "reps", label: "Reps", inputMode: "numeric", range: SET_REPS, step: 1 },
  { field: "rpe", label: "RPE", optional: true, inputMode: "decimal", range: RPE, step: 0.5 },
  { field: "restSeconds", label: "Rest (s)", optional: true, inputMode: "numeric", range: SET_REST_SECONDS, step: 1 },
] as const;

const emptySetState: SetFormState = { errors: {}, values: null };

function FormAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle">
      {message}
    </p>
  );
}

interface SetFieldsProps {
  /** Unique per form on the page, used for element ids. */
  idPrefix: string;
  /** Appended to each label for screen readers, e.g. "for Bench press set 2". */
  context: string;
  defaults: Omit<SetFormValues, "exerciseId">;
  errors: SetFormState["errors"];
}

/** Weight, reps, RPE and rest inputs, labelled and wired to their errors. */
function SetFields({ idPrefix, context, defaults, errors }: SetFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {fields.map(({ field, label, inputMode, range, step, ...rest }) => {
        const id = `${idPrefix}-${field}`;
        const error = errors[field as SetField];
        return (
          <div key={field} className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={id} className={labelClass}>
              {label}
              {"optional" in rest && <span className="font-normal text-fg-subtle"> (optional)</span>}
              <span className="sr-only"> {context}</span>
            </label>
            <input
              id={id}
              name={field}
              type="number"
              inputMode={inputMode}
              min={range.min}
              max={range.max}
              step={step}
              defaultValue={defaults[field as SetField]}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className={inputClass}
            />
            {error && (
              <p id={`${id}-error`} className={fieldErrorClass}>
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const asDefaults = (prefill: SetPrefill) => ({ ...prefill, rpe: "" });

export interface LogSetFormProps {
  sessionId: number;
  exerciseId: number;
  exerciseName: string;
  prefill: SetPrefill;
  nextSetNumber: number;
  /** Logs the set: the server action, or the guest form function. */
  action: SetFormAction;
}

/*
 * Presentational set forms; callers pass what each form does (server action
 * or guest form function). `set-forms.tsx` wires the server actions.
 */

/** Logs the next set of an exercise already on the screen. */
export function LogSetFormView({ sessionId, exerciseId, exerciseName, prefill, nextSetNumber, action }: LogSetFormProps) {
  const [state, formAction, pending] = useActionState(action, emptySetState);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="exerciseId" value={exerciseId} />
      <FormAlert message={state.errors.form ?? state.errors.exerciseId} />
      <SetFields
        idPrefix={`log-${exerciseId}`}
        context={`for ${exerciseName} set ${nextSetNumber}`}
        defaults={state.values ?? asDefaults(prefill)}
        errors={state.errors}
      />
      <button type="submit" disabled={pending} className={`${buttonClass("primary")} w-full sm:w-auto sm:self-end`}>
        {pending ? "Logging…" : `Log set ${nextSetNumber}`}
        <span className="sr-only"> of {exerciseName}</span>
      </button>
    </form>
  );
}

export interface AddExerciseFormProps {
  sessionId: number;
  exercises: Array<{ id: number; name: string; prefill: SetPrefill }>;
  action: SetFormAction;
}

/** Adds an exercise to the workout by logging its first set. */
export function AddExerciseFormView({ sessionId, exercises, action }: AddExerciseFormProps) {
  const [state, formAction, pending] = useActionState(action, emptySetState);
  const [selected, setSelected] = useState(state.values?.exerciseId ?? "");
  const prefill = exercises.find((e) => String(e.id) === selected)?.prefill;
  const exerciseError = state.errors.exerciseId;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <FormAlert message={state.errors.form} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="add-exercise" className={labelClass}>
          Exercise
        </label>
        <select
          id="add-exercise"
          name="exerciseId"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          aria-invalid={exerciseError ? true : undefined}
          aria-describedby={exerciseError ? "add-exercise-error" : undefined}
          className={inputClass}
        >
          <option value="" disabled>
            Choose an exercise…
          </option>
          {exercises.map((exercise) => (
            <option key={exercise.id} value={String(exercise.id)}>
              {exercise.name}
            </option>
          ))}
        </select>
        {exerciseError && (
          <p id="add-exercise-error" className={fieldErrorClass}>
            {exerciseError}
          </p>
        )}
      </div>
      {/* Remounts on a new choice so the fields show that exercise's prefill. */}
      <SetFields
        key={selected}
        idPrefix="add-exercise"
        context="for the new exercise"
        defaults={
          state.values && state.values.exerciseId === selected
            ? state.values
            : asDefaults(prefill ?? { weightKg: "", reps: "", restSeconds: "" })
        }
        errors={state.values?.exerciseId === selected ? state.errors : {}}
      />
      <button type="submit" disabled={pending} className={`${buttonClass("secondary")} w-full sm:w-auto sm:self-end`}>
        {pending ? "Adding…" : "Add and log first set"}
      </button>
    </form>
  );
}

export interface SetRowProps {
  sessionId: number;
  set: LoggedSet;
  exerciseName: string;
  editSetAction: SetFormAction;
  deleteSetAction: DeleteSetAction;
}

/** One logged set, with an inline editor and a delete button. */
export function SetRowView({ sessionId, set, exerciseName, editSetAction, deleteSetAction }: SetRowProps) {
  const [editState, editAction, editing] = useActionState(editSetAction, emptySetState);
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteSetAction,
    {} satisfies DeleteSetState as DeleteSetState,
  );
  const name = `${exerciseName} set ${set.setNumber}`;
  const defaults = editState.values ?? {
    weightKg: String(set.weightKg),
    reps: String(set.reps),
    rpe: set.rpe === null ? "" : String(set.rpe),
    restSeconds: set.restSeconds === null ? "" : String(set.restSeconds),
  };

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-3">
        <span className="w-6 shrink-0 text-sm font-semibold text-fg-subtle" aria-hidden="true">
          {set.setNumber}
        </span>
        <p className="min-w-0 flex-1 text-fg">
          <span className="sr-only">Set {set.setNumber}: </span>
          {set.weightKg} kg × {set.reps}
          {set.rpe !== null && <span className="text-sm text-fg-muted"> · RPE {set.rpe}</span>}
          {set.restSeconds !== null && <span className="text-sm text-fg-muted"> · {set.restSeconds} s rest</span>}
        </p>
        <form action={deleteAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="setId" value={set.id} />
          <button
            type="submit"
            disabled={deleting}
            aria-label={`Delete ${name}`}
            className={buttonClass("ghost", "sm")}
          >
            Delete
          </button>
        </form>
      </div>
      <FormAlert message={deleteState.error} />
      <details className="group" open={editState.values !== null || undefined}>
        <summary className="cursor-pointer text-sm font-medium text-fg-muted hover:text-fg">
          Edit<span className="sr-only"> {name}</span>
        </summary>
        <form action={editAction} noValidate className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="setId" value={set.id} />
          <FormAlert message={editState.errors.form} />
          <SetFields idPrefix={`set-${set.id}`} context={`for ${name}`} defaults={defaults} errors={editState.errors} />
          <button type="submit" disabled={editing} className={`${buttonClass("secondary", "sm")} self-end`}>
            {editing ? "Saving…" : "Save set"}
            <span className="sr-only"> {name}</span>
          </button>
        </form>
      </details>
    </li>
  );
}
