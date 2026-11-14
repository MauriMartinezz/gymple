import type { LoggedSet } from "@/modules/sessions/domain/session";

/** One logged set, without edit or delete controls (the trainer's view). */
export function ReadOnlySet({ set }: { set: LoggedSet }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-6 shrink-0 text-sm font-semibold text-fg-subtle" aria-hidden="true">
        {set.setNumber}
      </span>
      <p className="min-w-0 flex-1 text-fg">
        <span className="sr-only">Set {set.setNumber}: </span>
        {set.weightKg} kg × {set.reps}
        {set.rpe !== null && <span className="text-sm text-fg-muted"> · RPE {set.rpe}</span>}
        {set.restSeconds !== null && <span className="text-sm text-fg-muted"> · {set.restSeconds} s rest</span>}
      </p>
    </li>
  );
}
