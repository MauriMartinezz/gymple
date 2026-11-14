import Link from "next/link";
import { buttonClass } from "@/shared/ui/styles";
import { discardSessionAction } from "./actions";
import { ConfirmDelete } from "./confirm-delete";
import { formatTargets, plural, type ActiveSessionView } from "./session-view";
import { AddExerciseForm, LogSetForm, SetRow } from "./set-forms";

/** The workout in progress: one card per exercise, then add, finish and discard. */
export function ActiveSession({ view }: { view: ActiveSessionView }) {
  return (
    <div className="flex flex-col gap-4">
      {view.cards.length === 0 && (
        <p className="rounded-xl border border-dashed border-border-strong px-6 py-8 text-center text-sm text-fg-muted">
          Add an exercise below to log your first set.
        </p>
      )}

      {view.cards.map((card) => {
        const headingId = `exercise-${card.exerciseId}-heading`;
        return (
          <section
            key={card.exerciseId}
            aria-labelledby={headingId}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <div>
              <h2 id={headingId} className="font-semibold text-fg">
                {card.name}
              </h2>
              <p className="mt-0.5 text-sm text-fg-subtle">
                {card.plannedSets === null
                  ? "Added in this workout"
                  : `${formatTargets(card.targets)} · ${card.sets.length}/${card.plannedSets} done`}
              </p>
            </div>

            {card.sets.length > 0 && (
              <ol className="divide-y divide-border" aria-label={`Sets of ${card.name}`}>
                {card.sets.map((set) => (
                  <SetRow
                    key={`${set.id}-${set.setNumber}-${set.weightKg}-${set.reps}-${set.rpe}-${set.restSeconds}`}
                    sessionId={view.id}
                    set={set}
                    exerciseName={card.name}
                  />
                ))}
              </ol>
            )}

            {card.suggestion && (
              <div className="rounded-md bg-primary-subtle px-3 py-2 text-sm text-on-primary-subtle">
                <p className="font-medium">
                  {card.suggestion.text}
                  {card.suggestion.sets && <span className="font-normal"> · {card.suggestion.sets}</span>}
                </p>
                {card.suggestion.note && <p className="mt-0.5 whitespace-pre-line">{card.suggestion.note}</p>}
              </div>
            )}
            {card.lastTime && <p className="text-sm text-fg-muted">{card.lastTime}</p>}
            {/* Remounts after each logged set so the fields show the new prefill. */}
            <LogSetForm
              key={card.sets.length}
              sessionId={view.id}
              exerciseId={card.exerciseId}
              exerciseName={card.name}
              prefill={card.prefill}
              nextSetNumber={card.sets.length + 1}
            />
          </section>
        );
      })}

      {view.addable.length > 0 && (
        <section
          aria-labelledby="add-exercise-heading"
          className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong bg-surface p-4"
        >
          <h2 id="add-exercise-heading" className="font-semibold text-fg">
            Add exercise
          </h2>
          <AddExerciseForm key={view.setCount} sessionId={view.id} exercises={view.addable} />
        </section>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between">
        <ConfirmDelete
          action={discardSessionAction}
          sessionId={view.id}
          label="Discard workout"
          question={`Discard this workout and its ${plural(view.setCount, "set")}? This can't be undone.`}
          confirmLabel="Yes, discard workout"
        />
        <Link href="/sessions/active/finish" className={buttonClass("primary")}>
          Finish workout
        </Link>
      </div>
    </div>
  );
}
