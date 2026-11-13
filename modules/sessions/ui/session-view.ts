import type { Routine } from "@/modules/routines/domain/routine";
import type { LoggedSet, WorkoutSession } from "../domain/session";

/** Pure view models for the session pages; no I/O, so they are easy to test. */

export interface ExerciseRef {
  id: number;
  name: string;
  archived: boolean;
}

export interface SetPrefill {
  weightKg: string;
  reps: string;
  restSeconds: string;
}

export interface ExerciseCard {
  exerciseId: number;
  name: string;
  /** The routine's targets, or null for an exercise added during the workout. */
  target: { sets: number; repsMin: number; repsMax: number; restSeconds: number } | null;
  sets: LoggedSet[];
  prefill: SetPrefill;
  /** "Last time: 80 kg × 8", from the most recent finished workout. */
  lastTime: string | null;
}

export interface ActiveSessionView {
  id: number;
  title: string;
  startedAt: Date;
  cards: ExerciseCard[];
  /** Active exercises not in the workout yet, with their prefill. */
  addable: Array<{ id: number; name: string; prefill: SetPrefill }>;
  setCount: number;
}

export const FREE_WORKOUT = "Free workout";

export function formatWeight(weightKg: number): string {
  return `${weightKg} kg`;
}

export function formatSet(set: Pick<LoggedSet, "weightKg" | "reps">): string {
  return `${formatWeight(set.weightKg)} × ${set.reps}`;
}

export function formatTarget(target: NonNullable<ExerciseCard["target"]>): string {
  const reps = target.repsMin === target.repsMax ? `${target.repsMin}` : `${target.repsMin}–${target.repsMax}`;
  return `${target.sets} × ${reps} · ${target.restSeconds} s rest`;
}

export function formatDuration(startedAt: Date, finishedAt: Date): string {
  const minutes = Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

export function formatDate(date: Date): string {
  return date.toLocaleString("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Builds the active workout screen: the routine's exercises in routine order
 * (first occurrence of a repeated exercise only), then exercises added during
 * the workout in the order first logged.
 *
 * Prefill: weight and reps of the exercise's last set in this workout, else
 * of its last set in the most recent finished workout; rest from the last
 * set, else the routine target.
 */
export function buildActiveSessionView(
  session: WorkoutSession,
  routine: Pick<Routine, "name" | "items"> | null,
  exercises: ExerciseRef[],
  lastPerformance: ReadonlyMap<number, LoggedSet>,
): ActiveSessionView {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const cards: ExerciseCard[] = [];
  const shown = new Set<number>();

  const card = (exerciseId: number, target: ExerciseCard["target"]): ExerciseCard => {
    const sets = session.sets.filter((s) => s.exerciseId === exerciseId);
    const previous = lastPerformance.get(exerciseId) ?? null;
    return {
      exerciseId,
      name: names.get(exerciseId) ?? "Unknown exercise",
      target,
      sets,
      prefill: prefillFor(sets.at(-1) ?? null, previous, target?.restSeconds ?? null),
      lastTime: previous ? `Last time: ${formatSet(previous)}` : null,
    };
  };

  for (const item of routine?.items ?? []) {
    if (shown.has(item.exerciseId)) continue;
    shown.add(item.exerciseId);
    cards.push(
      card(item.exerciseId, {
        sets: item.targetSets,
        repsMin: item.targetRepsMin,
        repsMax: item.targetRepsMax,
        restSeconds: item.restSeconds,
      }),
    );
  }
  for (const set of session.sets) {
    if (shown.has(set.exerciseId)) continue;
    shown.add(set.exerciseId);
    cards.push(card(set.exerciseId, null));
  }

  const addable = exercises
    .filter((e) => !e.archived && !shown.has(e.id))
    .map((e) => ({ id: e.id, name: e.name, prefill: prefillFor(null, lastPerformance.get(e.id) ?? null, null) }));

  return {
    id: session.id,
    title: routine?.name ?? FREE_WORKOUT,
    startedAt: session.startedAt,
    cards,
    addable,
    setCount: session.sets.length,
  };
}

function prefillFor(inSession: LoggedSet | null, previous: LoggedSet | null, targetRest: number | null): SetPrefill {
  const source = inSession ?? previous;
  const rest = inSession?.restSeconds ?? targetRest;
  return {
    weightKg: source ? String(source.weightKg) : "",
    reps: source ? String(source.reps) : "",
    restSeconds: rest === null ? "" : String(rest),
  };
}

export interface ExerciseGroup {
  exerciseId: number;
  name: string;
  sets: LoggedSet[];
}

/** Sets grouped by exercise, in the order each exercise was first logged. */
export function groupSets(sets: readonly LoggedSet[], exercises: ExerciseRef[]): ExerciseGroup[] {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const groups = new Map<number, ExerciseGroup>();
  for (const set of sets) {
    const group = groups.get(set.exerciseId) ?? {
      exerciseId: set.exerciseId,
      name: names.get(set.exerciseId) ?? "Unknown exercise",
      sets: [],
    };
    group.sets.push(set);
    groups.set(set.exerciseId, group);
  }
  return [...groups.values()];
}

export interface HistoryEntry {
  id: number;
  title: string;
  date: string;
  exerciseCount: number;
  setCount: number;
  duration: string;
}

export function toHistoryEntry(session: WorkoutSession, routineNames: ReadonlyMap<number, string>): HistoryEntry {
  return {
    id: session.id,
    title: (session.routineId !== null && routineNames.get(session.routineId)) || FREE_WORKOUT,
    date: formatDate(session.startedAt),
    exerciseCount: new Set(session.sets.map((s) => s.exerciseId)).size,
    setCount: session.sets.length,
    duration: session.finishedAt ? formatDuration(session.startedAt, session.finishedAt) : "",
  };
}

export function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}
