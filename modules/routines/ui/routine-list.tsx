import { StartSessionButton } from "@/modules/sessions/ui/start-session-button";
import type { Routine } from "../domain/routine";
import { archiveRoutineAction, restoreRoutineAction } from "./actions";
import { RoutineListView } from "./routine-list-view";

interface RoutineListProps {
  active: Routine[];
  archived: Routine[];
}

/** The signed-in list, wired to the server actions and the start-workout button. */
export function RoutineList({ active, archived }: RoutineListProps) {
  return (
    <RoutineListView
      active={active}
      archived={archived}
      archiveAction={archiveRoutineAction}
      restoreAction={restoreRoutineAction}
      renderStart={(routine) => (
        <StartSessionButton routineId={routine.id} label="Start" ariaLabel={`Start ${routine.name}`} size="sm" />
      )}
    />
  );
}
