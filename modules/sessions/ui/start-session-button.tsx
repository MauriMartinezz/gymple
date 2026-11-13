"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/shared/ui/styles";
import { startSessionAction, type StartSessionState } from "./actions";

interface StartSessionButtonProps {
  /** Null starts a free workout. */
  routineId: number | null;
  label: string;
  /** Accessible name when the visible label is short, e.g. "Start Push day". */
  ariaLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "sm";
}

/** Starts a workout; when one is already active, says so and links to it. */
export function StartSessionButton({
  routineId,
  label,
  ariaLabel,
  variant = "primary",
  size = "md",
}: StartSessionButtonProps) {
  const [state, formAction, pending] = useActionState(startSessionAction, {} as StartSessionState);
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
            <Link href="/sessions/active" className="font-medium underline">
              Go to your workout
            </Link>
          )}
        </p>
      )}
    </form>
  );
}
