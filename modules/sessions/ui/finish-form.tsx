"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, fieldErrorClass, labelClass, textareaClass } from "@/shared/ui/styles";
import { SESSION_NOTES_MAX } from "../domain/session";
import { finishSessionAction, type FinishFormState } from "./actions";

interface FinishFormProps {
  sessionId: number;
  routineName: string | null;
  /** What saving would add to the routine; empty means the workout just saves. */
  changes: string[];
}

export function FinishForm({ sessionId, routineName, changes }: FinishFormProps) {
  const [state, formAction, pending] = useActionState(finishSessionAction, {
    errors: {},
    values: { notes: "" },
  } satisfies FinishFormState as FinishFormState);
  const { errors, values } = state;
  const alert = errors.form ?? errors.sets ?? errors.routine;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="sessionId" value={sessionId} />
      {alert && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle">
          {alert}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notes <span className="font-normal text-fg-subtle">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          maxLength={SESSION_NOTES_MAX}
          defaultValue={values.notes}
          placeholder="How did it feel?"
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

      {changes.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-sunken p-4">
          <h2 className="font-medium text-fg">Update {routineName ?? "the routine"}?</h2>
          <p className="mt-1 text-sm text-fg-muted">This workout went beyond the routine:</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-fg">
            {changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/sessions/active" className={buttonClass("secondary")}>
          Back to workout
        </Link>
        <button type="submit" disabled={pending} className={buttonClass(changes.length > 0 ? "secondary" : "primary")}>
          Save workout
        </button>
        {changes.length > 0 && (
          <button type="submit" name="updateRoutine" value="yes" disabled={pending} className={buttonClass("primary")}>
            Save and update routine
          </button>
        )}
      </div>
    </form>
  );
}
