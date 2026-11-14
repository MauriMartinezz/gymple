"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/shared/ui/styles";
import type { StartSessionAction, StartSessionState } from "./session-form-state";

export interface StartSessionButtonViewProps {
  /** Null starts a free workout. */
  routineId: number | null;
  label: string;
  /** Accessible name when the visible label is short, e.g. "Start Push day". */
  ariaLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "sm";
  /** Starts the workout: the server action, or the guest form function. */
  action: StartSessionAction;
  /** The active workout's page, linked when one is already active. */
  activeHref: string;
}

/**
 * Starts a workout; when one is already active, says so and links to it.
 * Presentational; `start-session-button.tsx` wires the server action.
 */
export function StartSessionButtonView({
  routineId,
  label,
  ariaLabel,
  variant = "primary",
  size = "md",
  action,
  activeHref,
}: StartSessionButtonViewProps) {
  const [state, formAction, pending] = useActionState(action, {} as StartSessionState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="routineId" value={routineId ?? ""} />
      <button type="submit" disabled={pending} aria-label={ariaLabel} className={buttonClass(variant, size)}>
        {pending ? "Starting…" : label}
      </button>
      {state.error && (
        <p role="alert" className="max-w-56 text-right text-sm text-danger">
          {state.error}{" "}
          {state.activeSessionId !== undefined && (
            <Link href={activeHref} className="font-medium underline">
              Go to your workout
            </Link>
          )}
        </p>
      )}
    </form>
  );
}
