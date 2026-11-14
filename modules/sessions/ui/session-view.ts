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

export interface ExerciseTarget {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
}

/** A trainer's load suggestion as the active workout uses it (S10). */
export interface PrefillSuggestion {
  trainerName: string;
  weightKg: number;
  reps: number;
  sets: number | null;
  note: string | null;
}

export interface SuggestionLine {
  /** "Suggested by Ana: 85 kg × 6". */
  text: string;
  /** "4 sets", when the trainer gave a number of sets. */
  sets: string | null;
  note: string | null;
}

export interface ExerciseCard {
  exerciseId: number;
  name: string;
  /** Each routine occurrence of the exercise, in routine order; empty when added during the workout. */
  targets: ExerciseTarget[];
  /** Sets planned across every occurrence, or null when added during the workout. */
  plannedSets: number | null;
  sets: LoggedSet[];
  prefill: SetPrefill;
  /** "Last time: 80 kg × 8", from the most recent finished workout. */
  lastTime: string | null;
  /** The effective trainer suggestion for the exercise, if any. */
  suggestion: SuggestionLine | null;
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

export function formatTarget(target: ExerciseTarget): string {
  const reps = target.repsMin === target.repsMax ? `${target.repsMin}` : `${target.repsMin}–${target.repsMax}`;
  return `${target.sets} × ${reps} · ${target.restSeconds} s rest`;
}

/** A repeated exercise's occurrences, in routine order: "3 × 8–12 · 90 s rest, then 1 × 15 · 45 s rest". */
export function formatTargets(targets: readonly ExerciseTarget[]): string {
  return targets.map(formatTarget).join(", then ");
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
 * Builds the active workout screen: the routine's exercises in routine order,
 * one card per exercise at its first occurrence carrying every occurrence's
 * targets, then exercises added during the workout in the order first logged.
 *
 * Prefill: weight and reps of the exercise's last set in this workout, else
 * of the effective trainer suggestion while the exercise has no sets in this
 * workout, else of its last set in the most recent finished workout. Rest comes from the
 * occurrence the next set belongs to when that set starts it, else from the
 * last set, else from that occurrence's target.
 */
export function buildActiveSessionView(
  session: WorkoutSession,
  routine: Pick<Routine, "name" | "items"> | null,
  exercises: ExerciseRef[],
  lastPerformance: ReadonlyMap<number, LoggedSet>,
  suggestions: ReadonlyMap<number, PrefillSuggestion> = new Map(),
): ActiveSessionView {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const cards: ExerciseCard[] = [];
  const shown = new Set<number>();

  const card = (exerciseId: number, targets: ExerciseTarget[]): ExerciseCard => {
    const sets = session.sets.filter((s) => s.exerciseId === exerciseId);
    const previous = lastPerformance.get(exerciseId) ?? null;
    const next = nextTarget(targets, sets.length);
    const inSession = sets.at(-1) ?? null;
    const suggestion = suggestions.get(exerciseId) ?? null;
    return {
      exerciseId,
      name: names.get(exerciseId) ?? "Unknown exercise",
      targets,
      plannedSets: targets.length === 0 ? null : targets.reduce((sum, t) => sum + t.sets, 0),
      sets,
      prefill: prefillFor(
        inSession,
        suggestion ?? previous,
        // A set that starts a later occurrence takes that occurrence's rest, not the previous set's.
        (next?.startsOccurrence ? null : inSession?.restSeconds) ?? next?.target.restSeconds ?? null,
      ),
      lastTime: previous ? `Last time: ${formatSet(previous)}` : null,
      suggestion: suggestion && suggestionLine(suggestion),
    };
  };

  const targetsByExercise = new Map<number, ExerciseTarget[]>();
  for (const item of routine?.items ?? []) {
    const targets = targetsByExercise.get(item.exerciseId) ?? [];
    targets.push({
      sets: item.targetSets,
      repsMin: item.targetRepsMin,
      repsMax: item.targetRepsMax,
      restSeconds: item.restSeconds,
    });
    targetsByExercise.set(item.exerciseId, targets);
  }
  for (const [exerciseId, targets] of targetsByExercise) {
    shown.add(exerciseId);
    cards.push(card(exerciseId, targets));
  }
  for (const set of session.sets) {
    if (shown.has(set.exerciseId)) continue;
    shown.add(set.exerciseId);
    cards.push(card(set.exerciseId, []));
  }

  const addable = exercises
    .filter((e) => !e.archived && !shown.has(e.id))
    .map((e) => ({
      id: e.id,
      name: e.name,
      prefill: prefillFor(null, suggestions.get(e.id) ?? lastPerformance.get(e.id) ?? null, null),
    }));

  return {
    id: session.id,
    title: routine?.name ?? FREE_WORKOUT,
    startedAt: session.startedAt,
    cards,
    addable,
    setCount: session.sets.length,
  };
}

/**
 * The occurrence the set after `logged` sets belongs to (the last one once
 * the plan is exceeded), and whether that set is the first of a later occurrence.
 */
function nextTarget(
  targets: readonly ExerciseTarget[],
  logged: number,
): { target: ExerciseTarget; startsOccurrence: boolean } | null {
  let start = 0;
  for (const [index, target] of targets.entries()) {
    if (logged < start + target.sets || index === targets.length - 1) {
      return { target, startsOccurrence: index > 0 && logged === start };
    }
    start += target.sets;
  }
  return null;
}

function suggestionLine(suggestion: PrefillSuggestion): SuggestionLine {
  return {
    text: `Suggested by ${suggestion.trainerName}: ${formatSet(suggestion)}`,
    sets: suggestion.sets === null ? null : plural(suggestion.sets, "set"),
    note: suggestion.note,
  };
}

/** Weight and reps from this workout's last set, else from `fallback` (a suggestion or last time). */
function prefillFor(
  inSession: LoggedSet | null,
  fallback: Pick<LoggedSet, "weightKg" | "reps"> | null,
  rest: number | null,
): SetPrefill {
  const source = inSession ?? fallback;
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
