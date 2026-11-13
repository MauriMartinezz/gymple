"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  buttonClass,
  fieldErrorClass,
  inputClass,
  labelClass,
  textareaClass,
} from "@/shared/ui/styles";
import {
  REST_SECONDS,
  ROUTINE_DESCRIPTION_MAX,
  ROUTINE_ITEM_NOTES_MAX,
  ROUTINE_ITEMS_MAX,
  ROUTINE_NAME_MAX,
  TARGET_REPS,
  TARGET_SETS,
  type RoutineItemErrors,
} from "../domain/routine";
import type { RoutineFormState } from "./actions";
import {
  itemFieldName,
  type RoutineFormValues,
  type RoutineItemFormValues,
} from "./parse-routine-form";

export interface ExerciseOption {
  id: number;
  name: string;
  archived: boolean;
}

interface RoutineFormProps {
  action: (state: RoutineFormState, formData: FormData) => Promise<RoutineFormState>;
  /** Active exercises, plus archived ones the routine already uses. */
  exercises: ExerciseOption[];
  initialValues?: RoutineFormValues;
  submitLabel: string;
}

const defaultItem: RoutineItemFormValues = {
  exerciseId: "",
  targetSets: "3",
  targetRepsMin: "8",
  targetRepsMax: "12",
  restSeconds: "90",
  notes: "",
};

const emptyValues: RoutineFormValues = { name: "", description: "", items: [defaultItem] };

/** A row of the editor: stable key for React, values, and the errors it was returned with. */
interface Row {
  key: number;
  values: RoutineItemFormValues;
  errors?: RoutineItemErrors;
}

let nextRowKey = 0;

function toRows({ values, errors }: RoutineFormState): Row[] {
  return values.items.map((item, index) => ({
    key: nextRowKey++,
    values: item,
    errors: errors.itemErrors?.[index],
  }));
}

export function RoutineForm({
  action,
  exercises,
  initialValues = emptyValues,
  submitLabel,
}: RoutineFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    errors: {},
    values: initialValues,
  });
  const { errors, values } = state;

  // Items are controlled; show what the server returned each time it answers.
  const [rows, setRows] = useState(() => toRows(state));
  const [shownState, setShownState] = useState(state);
  if (shownState !== state) {
    setShownState(state);
    setRows(toRows(state));
  }

  const updateRow = (key: number, field: keyof RoutineItemFormValues, value: string) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, values: { ...row.values, [field]: value } } : row)),
    );
  const addRow = () =>
    setRows((current) => [...current, { key: nextRowKey++, values: { ...defaultItem } }]);
  const removeRow = (key: number) => setRows((current) => current.filter((row) => row.key !== key));
  const moveRow = (index: number, offset: -1 | 1) =>
    setRows((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });

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
          maxLength={ROUTINE_NAME_MAX}
          defaultValue={values.name}
          placeholder="e.g. Push day"
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
        <label htmlFor="description" className={labelClass}>
          Description <span className="font-normal text-fg-subtle">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          maxLength={ROUTINE_DESCRIPTION_MAX}
          defaultValue={values.description}
          placeholder="Goal, schedule, warm-up…"
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? "description-error" : undefined}
          className={textareaClass}
        />
        {errors.description && (
          <p id="description-error" className={fieldErrorClass}>
            {errors.description}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-3" aria-describedby={errors.items ? "items-error" : undefined}>
        <legend className={`${labelClass} mb-1.5`}>Exercises</legend>
        {errors.items && (
          <p id="items-error" className={fieldErrorClass}>
            {errors.items}
          </p>
        )}

        <ol className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <ItemEditor
              key={row.key}
              row={row}
              index={index}
              count={rows.length}
              exercises={exercises}
              onChange={(field, value) => updateRow(row.key, field, value)}
              onMove={(offset) => moveRow(index, offset)}
              onRemove={() => removeRow(row.key)}
            />
          ))}
        </ol>

        {rows.length < ROUTINE_ITEMS_MAX && (
          <button type="button" onClick={addRow} className={`${buttonClass("secondary", "sm")} self-start`}>
            Add exercise
          </button>
        )}
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/routines" className={buttonClass("secondary")}>
          Cancel
        </Link>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

interface ItemEditorProps {
  row: Row;
  index: number;
  count: number;
  exercises: ExerciseOption[];
  onChange: (field: keyof RoutineItemFormValues, value: string) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}

const numberFields = [
  { field: "targetSets", label: "Sets", range: TARGET_SETS },
  { field: "targetRepsMin", label: "Min reps", range: TARGET_REPS },
  { field: "targetRepsMax", label: "Max reps", range: TARGET_REPS },
  { field: "restSeconds", label: "Rest (s)", range: REST_SECONDS },
] as const;

function ItemEditor({ row, index, count, exercises, onChange, onMove, onRemove }: ItemEditorProps) {
  const position = index + 1;
  const { values, errors = {} } = row;
  const id = (field: keyof RoutineItemFormValues) => `items-${index}-${field}`;
  const errorId = (field: keyof RoutineItemFormValues) => `${id(field)}-error`;
  const invalid = (field: keyof RoutineItemFormValues) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? errorId(field) : undefined,
  });
  const fieldError = (field: keyof RoutineItemFormValues) =>
    errors[field] && (
      <p id={errorId(field)} className={fieldErrorClass}>
        {errors[field]}
      </p>
    );

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id("exerciseId")} className={labelClass}>
            Exercise {position}
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              aria-label={`Move exercise ${position} up`}
              className={buttonClass("ghost", "sm")}
            >
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={index === count - 1}
              aria-label={`Move exercise ${position} down`}
              className={buttonClass("ghost", "sm")}
            >
              <span aria-hidden="true">↓</span>
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove exercise ${position}`}
              className={buttonClass("ghost", "sm")}
            >
              Remove
            </button>
          </div>
        </div>
        <select
          id={id("exerciseId")}
          name={itemFieldName(index, "exerciseId")}
          value={values.exerciseId}
          onChange={(event) => onChange("exerciseId", event.target.value)}
          className={inputClass}
          {...invalid("exerciseId")}
        >
          <option value="" disabled>
            Choose an exercise…
          </option>
          {exercises.map((exercise) => (
            <option key={exercise.id} value={String(exercise.id)}>
              {exercise.archived ? `${exercise.name} (archived)` : exercise.name}
            </option>
          ))}
        </select>
        {fieldError("exerciseId")}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numberFields.map(({ field, label, range }) => (
          <div key={field} className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={id(field)} className={labelClass}>
              {label}
              <span className="sr-only"> for exercise {position}</span>
            </label>
            <input
              id={id(field)}
              name={itemFieldName(index, field)}
              type="number"
              inputMode="numeric"
              min={range.min}
              max={range.max}
              step={1}
              value={values[field]}
              onChange={(event) => onChange(field, event.target.value)}
              className={inputClass}
              {...invalid(field)}
            />
            {fieldError(field)}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("notes")} className={labelClass}>
          Notes <span className="font-normal text-fg-subtle">(optional)</span>
          <span className="sr-only"> for exercise {position}</span>
        </label>
        <input
          id={id("notes")}
          name={itemFieldName(index, "notes")}
          maxLength={ROUTINE_ITEM_NOTES_MAX}
          value={values.notes}
          onChange={(event) => onChange("notes", event.target.value)}
          placeholder="Tempo, pauses, cues…"
          className={inputClass}
          {...invalid("notes")}
        />
        {fieldError("notes")}
      </div>
    </li>
  );
}
