import Link from "next/link";
import { buttonClass } from "@/shared/ui/styles";
import { MUSCLE_GROUP_LABELS, type Exercise } from "../domain/exercise";
import { archiveExerciseAction, restoreExerciseAction } from "./actions";

interface ExerciseListProps {
  active: Exercise[];
  archived: Exercise[];
}

export function ExerciseList({ active, archived }: ExerciseListProps) {
  return (
    <div className="flex flex-col gap-8">
      {active.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
          <p className="font-medium text-fg">No exercises yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Add the exercises you train so you can build routines and log your sets.
          </p>
          <Link href="/exercises/new" className={`${buttonClass("primary")} mt-5`}>
            Add your first exercise
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {active.map((exercise) => (
            <li key={exercise.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-fg">{exercise.name}</p>
                <MuscleGroupBadge exercise={exercise} />
              </div>
              <Link
                href={`/exercises/${exercise.id}/edit`}
                className={buttonClass("ghost", "sm")}
                aria-label={`Edit ${exercise.name}`}
              >
                Edit
              </Link>
              <form action={archiveExerciseAction}>
                <input type="hidden" name="id" value={exercise.id} />
                <button
                  type="submit"
                  className={buttonClass("ghost", "sm")}
                  aria-label={`Archive ${exercise.name}`}
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
          <p className="mt-2 text-sm text-fg-subtle">
            Archived exercises keep their history and are hidden from new routines.
          </p>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-sunken">
            {archived.map((exercise) => (
              <li key={exercise.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-fg-muted">{exercise.name}</p>
                  <MuscleGroupBadge exercise={exercise} />
                </div>
                <form action={restoreExerciseAction}>
                  <input type="hidden" name="id" value={exercise.id} />
                  <button
                    type="submit"
                    className={buttonClass("secondary", "sm")}
                    aria-label={`Restore ${exercise.name}`}
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

function MuscleGroupBadge({ exercise }: { exercise: Exercise }) {
  return (
    <span className="mt-1 inline-block rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-on-primary-subtle">
      {MUSCLE_GROUP_LABELS[exercise.muscleGroup]}
    </span>
  );
}
