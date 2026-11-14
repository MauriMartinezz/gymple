import type { Exercise } from "../domain/exercise";
import { archiveExerciseAction, restoreExerciseAction } from "./actions";
import { ExerciseListView } from "./exercise-list-view";

interface ExerciseListProps {
  active: Exercise[];
  archived: Exercise[];
}

/** The signed-in list, wired to the server actions. */
export function ExerciseList({ active, archived }: ExerciseListProps) {
  return (
    <ExerciseListView
      active={active}
      archived={archived}
      archiveAction={archiveExerciseAction}
      restoreAction={restoreExerciseAction}
    />
  );
}
