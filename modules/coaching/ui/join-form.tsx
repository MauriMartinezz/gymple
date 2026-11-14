"use client";

import { useActionState } from "react";
import { buttonClass } from "@/shared/ui/styles";
import { joinTrainerAction, type JoinFormState } from "./actions";

export function JoinForm({ code, trainerName }: { code: string; trainerName: string }) {
  const [state, formAction, pending] = useActionState(joinTrainerAction, {} as JoinFormState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="code" value={code} />
      {state.error && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Joining…" : "Join as student"}
        <span className="sr-only"> of {trainerName}</span>
      </button>
    </form>
  );
}
