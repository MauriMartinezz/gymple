import { validateExerciseInput, type ExerciseInput } from "@/modules/exercises/domain/exercise";
import { validateRoutineInput, type RoutineInput } from "@/modules/routines/domain/routine";
import { validateSessionNotes, validateSetInput, type SetInput } from "@/modules/sessions/domain/session";

/*
 * S14: turns an untrusted guest snapshot into what can be imported. Every
 * record goes through the same domain validation the app uses; a broken
 * record is skipped and reported, and a record that depends on it only loses
 * that reference. Records are identified by their guest ids ("keys") only to
 * rewrite references; the writer gives every record a new id. User ids in
 * the payload are never read. Nothing here throws.
 */

/** Supported snapshot version (the guest storage's `GUEST_SNAPSHOT_VERSION`). */
export const IMPORTABLE_SNAPSHOT_VERSION = 1;

/**
 * Sanity bounds for imported dates, first chosen to fit a MySQL TIMESTAMP
 * (1970-01-01 00:00:01 to 2038-01-19 03:14:07 UTC) and kept on Postgres; a
 * day of margin on each side keeps every time zone safe.
 */
const DATE_RANGE = { min: Date.UTC(1970, 0, 2), max: Date.UTC(2038, 0, 18) };

export interface PlannedExercise {
  key: number;
  input: ExerciseInput;
  archivedAt: Date | null;
}

/** Item `exerciseId`s are exercise keys of this plan. */
export interface PlannedRoutine {
  key: number;
  input: RoutineInput;
  archivedAt: Date | null;
}

/** In logging order; the writer numbers them per stored exercise. */
export interface PlannedSet {
  exerciseKey: number;
  input: SetInput;
  completedAt: Date;
}

export interface PlannedWorkout {
  routineKey: number | null;
  startedAt: Date;
  /** Null for the workout in progress (at most one per plan). */
  finishedAt: Date | null;
  notes: string | null;
  /** Never empty. */
  sets: PlannedSet[];
}

export interface GuestImportPlan {
  exercises: PlannedExercise[];
  routines: PlannedRoutine[];
  workouts: PlannedWorkout[];
  /** Short, human-readable lines about what will not be imported. */
  skipped: string[];
}

export type GuestImportPlanResult = { ok: true; plan: GuestImportPlan } | { ok: false; message: string };

export const UNREADABLE_GUEST_DATA =
  "The guest data could not be read, so nothing was imported. It is still in this browser.";

export function planGuestImport(raw: unknown): GuestImportPlanResult {
  if (!isRecord(raw) || raw.version !== IMPORTABLE_SNAPSHOT_VERSION) {
    return { ok: false, message: UNREADABLE_GUEST_DATA };
  }
  const skipped: string[] = [];
  const exercises = planExercises(collection(raw.exercises, "exercises", skipped), skipped);
  const exerciseKeys = new Set(exercises.map((e) => e.key));
  const routines = planRoutines(collection(raw.routines, "routines", skipped), exerciseKeys, skipped);
  const routineKeys = new Set(routines.map((r) => r.key));
  const workouts = planWorkouts(collection(raw.sessions, "workouts", skipped), exerciseKeys, routineKeys, skipped);
  return { ok: true, plan: { exercises, routines, workouts, skipped } };
}

function collection(value: unknown, label: string, skipped: string[]): unknown[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  skipped.push(`The ${label} could not be read.`);
  return [];
}

function planExercises(rows: unknown[], skipped: string[]): PlannedExercise[] {
  const planned: PlannedExercise[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (!isRecord(row) || !isKey(row.id)) {
      skipped.push("An exercise could not be read.");
      continue;
    }
    const label = labelOf("Exercise", "An exercise", row.name);
    const validation = validateExerciseInput(row);
    if (!validation.ok) {
      skipped.push(`${label}: ${firstError(validation.errors)}`);
      continue;
    }
    const archivedAt = optionalDate(row.archivedAt);
    if (archivedAt === INVALID) {
      skipped.push(`${label}: invalid date.`);
      continue;
    }
    if (seen.has(row.id)) {
      skipped.push(`${label}: its id is repeated.`);
      continue;
    }
    seen.add(row.id);
    planned.push({ key: row.id, input: validation.value, archivedAt });
  }
  return planned;
}

function planRoutines(rows: unknown[], exerciseKeys: Set<number>, skipped: string[]): PlannedRoutine[] {
  const planned: PlannedRoutine[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (!isRecord(row) || !isKey(row.id)) {
      skipped.push("A routine could not be read.");
      continue;
    }
    const label = labelOf("Routine", "A routine", row.name);
    const rawItems = Array.isArray(row.items) ? row.items : [];
    // Items of an exercise that is not imported lose only themselves.
    const linked = rawItems.filter((item) => isRecord(item) && exerciseKeys.has(item.exerciseId as number));
    let validation = validateRoutineInput({ name: row.name, description: row.description, items: linked });
    let items = linked;
    if (!validation.ok && onlyItemErrors(validation.errors)) {
      // Invalid items are records of their own: drop them, keep the routine.
      items = linked.filter((_, index) => !validation.ok && !validation.errors.itemErrors?.[index]);
      validation = validateRoutineInput({ name: row.name, description: row.description, items });
    }
    if (!validation.ok) {
      const reason = items.length === 0 && rawItems.length > 0 && !validation.errors.name && !validation.errors.description
        ? "no exercises left to import."
        : firstError(validation.errors);
      skipped.push(`${label}: ${reason}`);
      continue;
    }
    const archivedAt = optionalDate(row.archivedAt);
    if (archivedAt === INVALID) {
      skipped.push(`${label}: invalid date.`);
      continue;
    }
    if (seen.has(row.id)) {
      skipped.push(`${label}: its id is repeated.`);
      continue;
    }
    seen.add(row.id);
    const left = rawItems.length - validation.value.items.length;
    if (left > 0) skipped.push(`${label}: ${count(left, "exercise")} left out.`);
    planned.push({ key: row.id, input: validation.value, archivedAt });
  }
  return planned;
}

function planWorkouts(
  rows: unknown[],
  exerciseKeys: Set<number>,
  routineKeys: Set<number>,
  skipped: string[],
): PlannedWorkout[] {
  const planned: Array<{ workout: PlannedWorkout; label: string }> = [];
  for (const row of rows) {
    if (!isRecord(row)) {
      skipped.push("A workout could not be read.");
      continue;
    }
    const startedAt = requiredDate(row.startedAt);
    const finishedAt = optionalDate(row.finishedAt);
    if (startedAt === INVALID || finishedAt === INVALID) {
      skipped.push("A workout: invalid date.");
      continue;
    }
    const label = `Workout of ${startedAt.toISOString().slice(0, 10)}`;
    if (finishedAt && finishedAt < startedAt) {
      skipped.push(`${label}: it finishes before it starts.`);
      continue;
    }
    const notes = validateSessionNotes(row.notes);
    if (!notes.ok) {
      skipped.push(`${label}: ${notes.error}`);
      continue;
    }
    const rawSets = Array.isArray(row.sets) ? row.sets : [];
    const sets = planSets(rawSets, exerciseKeys);
    if (sets.length === 0) {
      skipped.push(`${label}: no sets left to import.`);
      continue;
    }
    if (sets.length < rawSets.length) skipped.push(`${label}: ${count(rawSets.length - sets.length, "set")} left out.`);
    let routineKey: number | null = null;
    if (row.routineId !== null && row.routineId !== undefined) {
      if (isKey(row.routineId) && routineKeys.has(row.routineId)) routineKey = row.routineId;
      else skipped.push(`${label}: its routine was not imported.`);
    }
    planned.push({ workout: { routineKey, startedAt, finishedAt, notes: notes.value, sets }, label });
  }
  return keepOneActive(planned, skipped);
}

function planSets(rows: unknown[], exerciseKeys: Set<number>): PlannedSet[] {
  const sets: PlannedSet[] = [];
  for (const row of rows) {
    if (!isRecord(row) || !isKey(row.exerciseId) || !exerciseKeys.has(row.exerciseId)) continue;
    const validation = validateSetInput(row);
    const completedAt = requiredDate(row.completedAt);
    if (!validation.ok || completedAt === INVALID) continue;
    sets.push({ exerciseKey: row.exerciseId, input: validation.value, completedAt });
  }
  return sets;
}

/** A user has at most one workout in progress: keep the most recently started. */
function keepOneActive(planned: Array<{ workout: PlannedWorkout; label: string }>, skipped: string[]) {
  const active = planned.filter((p) => p.workout.finishedAt === null);
  const kept = active.reduce<(typeof active)[number] | null>(
    (latest, p) => (!latest || p.workout.startedAt > latest.workout.startedAt ? p : latest),
    null,
  );
  for (const p of active) {
    if (p !== kept) skipped.push(`${p.label}: only one workout can be in progress.`);
  }
  return planned.filter((p) => p.workout.finishedAt !== null || p === kept).map((p) => p.workout);
}

const INVALID = Symbol("invalid date");

function optionalDate(value: unknown): Date | null | typeof INVALID {
  return value === null || value === undefined ? null : requiredDate(value);
}

function requiredDate(value: unknown): Date | typeof INVALID {
  if (typeof value !== "string") return INVALID;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) || time < DATE_RANGE.min || time > DATE_RANGE.max ? INVALID : date;
}

function onlyItemErrors(errors: { name?: string; description?: string; items?: string; itemErrors?: unknown }) {
  return !errors.name && !errors.description && !errors.items && Boolean(errors.itemErrors);
}

function firstError(errors: object): string {
  for (const value of Object.values(errors)) {
    if (typeof value === "string") return value;
  }
  return "invalid data.";
}

function labelOf(kind: string, fallback: string, name: unknown): string {
  const text = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  return text ? `${kind} "${text.length > 60 ? `${text.slice(0, 57)}...` : text}"` : fallback;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function isKey(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
