import type { Routine, RoutineInput, RoutineItem } from "@/modules/routines/domain/routine";
import type { LoggedSet } from "./session";

/** Rest given to an exercise added to a routine when none of its sets logged one. */
export const DEFAULT_REST_SECONDS = 90;

/** What the proposal needs from a logged set. */
export type ProposalSet = Pick<LoggedSet, "exerciseId" | "reps" | "restSeconds">;

/** One addition a session makes to its routine's template. */
export type RoutineChange =
  | {
      type: "add_exercise";
      exerciseId: number;
      targetSets: number;
      targetRepsMin: number;
      targetRepsMax: number;
      restSeconds: number;
    }
  | { type: "raise_sets"; exerciseId: number; from: number; to: number };

export interface RoutineUpdateProposal {
  /** Raises in routine order, then additions in the order first logged. Empty when nothing changes. */
  changes: RoutineChange[];
  /** The routine with the changes applied, ready for the routines module. */
  input: RoutineInput;
}

/**
 * Only additions reach the template: an exercise missing from the routine is
 * appended with targets taken from its sets, and an exercise logged with more
 * sets than planned gets the extra sets added to its target. A repeated exercise
 * is planned as the sum of its occurrences; the extra goes on the first one.
 * Fewer sets or skipped exercises never remove or lower anything.
 *
 * @param sets the session's sets, in logging order
 */
export function proposeRoutineUpdate(
  sets: readonly ProposalSet[],
  routine: Pick<Routine, "name" | "description" | "items">,
): RoutineUpdateProposal {
  const logged = groupByExercise(sets);
  const items: RoutineItem[] = routine.items.map((item) => ({ ...item }));
  const changes: RoutineChange[] = [];
  const seen = new Set<number>();

  for (const item of items) {
    if (seen.has(item.exerciseId)) continue;
    seen.add(item.exerciseId);
    // A repeated exercise is planned once per occurrence: compare against the total.
    const planned = items
      .filter((other) => other.exerciseId === item.exerciseId)
      .reduce((total, other) => total + other.targetSets, 0);
    const extra = (logged.get(item.exerciseId)?.length ?? 0) - planned;
    if (extra > 0) {
      const to = item.targetSets + extra;
      changes.push({ type: "raise_sets", exerciseId: item.exerciseId, from: item.targetSets, to });
      item.targetSets = to;
    }
  }

  for (const [exerciseId, exerciseSets] of logged) {
    if (seen.has(exerciseId)) continue;
    const reps = exerciseSets.map((s) => s.reps);
    const added = {
      exerciseId,
      targetSets: exerciseSets.length,
      targetRepsMin: Math.min(...reps),
      targetRepsMax: Math.max(...reps),
      restSeconds: exerciseSets.find((s) => s.restSeconds !== null)?.restSeconds ?? DEFAULT_REST_SECONDS,
    };
    changes.push({ type: "add_exercise", ...added });
    items.push({ ...added, notes: null });
  }

  return { changes, input: { name: routine.name, description: routine.description, items } };
}

/** One line of the finish dialog, e.g. "Add Dips (3 × 8–10)" or "Bench press: 3 → 4 sets". */
export function describeRoutineChange(change: RoutineChange, exerciseName: string): string {
  if (change.type === "raise_sets") return `${exerciseName}: ${change.from} → ${change.to} sets`;
  const reps =
    change.targetRepsMin === change.targetRepsMax
      ? `${change.targetRepsMin}`
      : `${change.targetRepsMin}–${change.targetRepsMax}`;
  return `Add ${exerciseName} (${change.targetSets} × ${reps})`;
}

/** Sets per exercise; a Map keeps the order each exercise was first logged. */
function groupByExercise(sets: readonly ProposalSet[]): Map<number, ProposalSet[]> {
  const groups = new Map<number, ProposalSet[]>();
  for (const set of sets) {
    const group = groups.get(set.exerciseId) ?? [];
    group.push(set);
    groups.set(set.exerciseId, group);
  }
  return groups;
}
