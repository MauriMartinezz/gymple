import Link from "next/link";
import { StartSessionButton } from "@/modules/sessions/ui/start-session-button";
import { buttonClass } from "@/shared/ui/styles";
import type { Routine } from "../domain/routine";
import { archiveRoutineAction, restoreRoutineAction } from "./actions";

interface RoutineListProps {
  active: Routine[];
  archived: Routine[];
}

export function RoutineList({ active, archived }: RoutineListProps) {
  return (
    <div className="flex flex-col gap-8">
      {active.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
          <p className="font-medium text-fg">No routines yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Group your exercises into a routine with target sets, reps and rest.
          </p>
          <Link href="/routines/new" className={`${buttonClass("primary")} mt-5`}>
            Create your first routine
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {active.map((routine) => (
            <li key={routine.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-fg">{routine.name}</p>
                <ExerciseCount routine={routine} />
              </div>
              <StartSessionButton
                routineId={routine.id}
                label="Start"
                ariaLabel={`Start ${routine.name}`}
                size="sm"
              />
              <Link
                href={`/routines/${routine.id}/edit`}
                className={buttonClass("ghost", "sm")}
                aria-label={`Edit ${routine.name}`}
              >
                Edit
              </Link>
              <form action={archiveRoutineAction}>
                <input type="hidden" name="id" value={routine.id} />
                <button
                  type="submit"
                  className={buttonClass("ghost", "sm")}
                  aria-label={`Archive ${routine.name}`}
                >
                  Archive
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-fg-muted hover:text-fg">
            Archived ({archived.length})
          </summary>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-sunken">
            {archived.map((routine) => (
              <li key={routine.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-fg-muted">{routine.name}</p>
                  <ExerciseCount routine={routine} />
                </div>
                <form action={restoreRoutineAction}>
                  <input type="hidden" name="id" value={routine.id} />
                  <button
                    type="submit"
                    className={buttonClass("secondary", "sm")}
                    aria-label={`Restore ${routine.name}`}
                  >
                    Restore
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ExerciseCount({ routine }: { routine: Routine }) {
  const count = routine.items.length;
  return (
    <p className="mt-0.5 text-sm text-fg-subtle">
      {count} {count === 1 ? "exercise" : "exercises"}
    </p>
  );
}
