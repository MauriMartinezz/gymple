import { getExercise, listExercises } from "@/modules/exercises/application/exercise-use-cases";
import type { ExerciseRepository } from "@/modules/exercises/domain/exercise-repository";
import { getRoutine, listRoutines } from "@/modules/routines/application/routine-use-cases";
import type { RoutineRepository } from "@/modules/routines/domain/routine-repository";
import { previewRoutineUpdate } from "../application/finish-workout-use-cases";
import { getActiveSession, getLastPerformances, getSession, listHistory } from "../application/session-use-cases";
import { describeRoutineChange } from "../domain/routine-changes";
import type { SessionRepository } from "../domain/session-repository";
import {
  buildActiveSessionView,
  FREE_WORKOUT,
  formatDate,
  formatDuration,
  groupSets,
  toHistoryEntry,
  type ExerciseRef,
  type PrefillSuggestion,
} from "./session-view";

/*
 * Reads for the workout pages, for one already resolved user and whatever
 * adapters the caller picked: the signed-in pages (MySQL, `session-service`)
 * and guest mode (browser storage) share them.
 */

export interface SessionReadRepositories {
  sessions: SessionRepository;
  routines: RoutineRepository;
  exercises: ExerciseRepository;
}

/** An exercise's name for messages; null when the user does not own it. */
export async function exerciseNameFor(exercises: ExerciseRepository, userId: number, exerciseId: number) {
  return (await getExercise(exercises, userId, exerciseId))?.name ?? null;
}

async function exerciseRefs(exercises: ExerciseRepository, userId: number): Promise<ExerciseRef[]> {
  const { active, archived } = await listExercises(exercises, userId);
  return [
    ...active.map((e) => ({ id: e.id, name: e.name, archived: false })),
    ...archived.map((e) => ({ id: e.id, name: e.name, archived: true })),
  ];
}

async function routineNames(routines: RoutineRepository, userId: number): Promise<Map<number, string>> {
  const { active, archived } = await listRoutines(routines, userId);
  return new Map([...active, ...archived].map((r) => [r.id, r.name]));
}

/** The active workout screen, or null when no workout is active. */
export async function readActiveSession(
  { sessions, routines, exercises }: SessionReadRepositories,
  userId: number,
  suggestions: ReadonlyMap<number, PrefillSuggestion> = new Map(),
) {
  const session = await getActiveSession(sessions, userId);
  if (!session) return null;

  const [routine, refs] = await Promise.all([
    session.routineId === null ? null : getRoutine(routines, userId, session.routineId),
    exerciseRefs(exercises, userId),
  ]);
  const lastPerformance = await getLastPerformances(
    sessions,
    userId,
    refs.map((e) => e.id),
  );
  return buildActiveSessionView(session, routine, refs, lastPerformance, suggestions);
}

/** The id of the user's active workout, if any, for links. */
export async function readActiveSessionId(sessions: SessionRepository, userId: number): Promise<number | null> {
  return (await getActiveSession(sessions, userId))?.id ?? null;
}

/** The finish step: what finishing would add to the routine, as dialog lines. */
export async function readFinishView({ sessions, routines, exercises }: SessionReadRepositories, userId: number) {
  const session = await getActiveSession(sessions, userId);
  if (!session) return null;

  const preview = await previewRoutineUpdate({ sessions, routines }, userId, session.id);
  const [routine, refs] = await Promise.all([
    preview ? getRoutine(routines, userId, preview.routineId) : null,
    preview ? exerciseRefs(exercises, userId) : [],
  ]);
  const names = new Map(refs.map((e) => [e.id, e.name]));
  return {
    id: session.id,
    setCount: session.sets.length,
    routineName: routine?.name ?? null,
    changes:
      preview?.changes.map((change) => describeRoutineChange(change, names.get(change.exerciseId) ?? "Exercise")) ?? [],
  };
}

/** Finished workouts, newest first. */
export async function readHistory({ sessions, routines }: Omit<SessionReadRepositories, "exercises">, userId: number) {
  const [finished, names] = await Promise.all([listHistory(sessions, userId), routineNames(routines, userId)]);
  return finished.map((session) => toHistoryEntry(session, names));
}

/** A finished workout of the user; null for a missing, foreign or active one. */
export async function readSessionDetail({ sessions, routines, exercises }: SessionReadRepositories, userId: number, id: number) {
  const session = await getSession(sessions, userId, id);
  if (!session || session.finishedAt === null) return null;

  const [names, refs] = await Promise.all([routineNames(routines, userId), exerciseRefs(exercises, userId)]);
  return {
    id: session.id,
    title: (session.routineId !== null && names.get(session.routineId)) || FREE_WORKOUT,
    date: formatDate(session.startedAt),
    duration: formatDuration(session.startedAt, session.finishedAt),
    notes: session.notes,
    setCount: session.sets.length,
    groups: groupSets(session.sets, refs),
  };
}
