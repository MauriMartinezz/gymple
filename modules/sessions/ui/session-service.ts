import "server-only";
import { db } from "@/infrastructure/db/client";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { getExercise, listExercises } from "@/modules/exercises/application/exercise-use-cases";
import { exerciseRepository } from "@/modules/exercises/ui/exercise-service";
import { getRoutine, listRoutines } from "@/modules/routines/application/routine-use-cases";
import { routineRepository } from "@/modules/routines/ui/routine-service";
import { previewRoutineUpdate } from "../application/finish-workout-use-cases";
import {
  getActiveSession,
  getLastPerformances,
  getSession,
  listHistory,
} from "../application/session-use-cases";
import { describeRoutineChange } from "../domain/routine-changes";
import { DrizzleSessionRepository } from "../infrastructure/drizzle-session-repository";
import { DrizzleSessionUnitOfWork } from "../infrastructure/drizzle-session-unit-of-work";
import {
  buildActiveSessionView,
  FREE_WORKOUT,
  formatDate,
  formatDuration,
  groupSets,
  toHistoryEntry,
  type ExerciseRef,
} from "./session-view";

export { parseSessionId } from "./parse-session-form";

/** Composition root: the one place that picks the MySQL adapters. */
export const sessionRepository = new DrizzleSessionRepository(db);
export const sessionUnitOfWork = new DrizzleSessionUnitOfWork(db);

/** An exercise's name for messages; null when the user does not own it. */
export async function exerciseNameOf(userId: number, exerciseId: number): Promise<string | null> {
  return (await getExercise(exerciseRepository, userId, exerciseId))?.name ?? null;
}

/*
 * Reads for pages. Each one resolves the signed-in user itself and passes
 * only that user's id down, so every read is scoped to them.
 */

async function exerciseRefs(userId: number): Promise<ExerciseRef[]> {
  const { active, archived } = await listExercises(exerciseRepository, userId);
  return [
    ...active.map((e) => ({ id: e.id, name: e.name, archived: false })),
    ...archived.map((e) => ({ id: e.id, name: e.name, archived: true })),
  ];
}

async function routineNames(userId: number): Promise<Map<number, string>> {
  const { active, archived } = await listRoutines(routineRepository, userId);
  return new Map([...active, ...archived].map((r) => [r.id, r.name]));
}

/** The active workout screen, or null when no workout is active. */
export async function loadActiveSession() {
  const user = await requireUser();
  const session = await getActiveSession(sessionRepository, user.id);
  if (!session) return null;

  const [routine, exercises] = await Promise.all([
    session.routineId === null ? null : getRoutine(routineRepository, user.id, session.routineId),
    exerciseRefs(user.id),
  ]);
  const lastPerformance = await getLastPerformances(
    sessionRepository,
    user.id,
    exercises.map((e) => e.id),
  );
  return buildActiveSessionView(session, routine, exercises, lastPerformance);
}

/** The id of the user's active workout, if any, for links. */
export async function loadActiveSessionId(): Promise<number | null> {
  const user = await requireUser();
  return (await getActiveSession(sessionRepository, user.id))?.id ?? null;
}

/** The finish step: what finishing would add to the routine, as dialog lines. */
export async function loadFinishView() {
  const user = await requireUser();
  const session = await getActiveSession(sessionRepository, user.id);
  if (!session) return null;

  const preview = await previewRoutineUpdate(
    { sessions: sessionRepository, routines: routineRepository },
    user.id,
    session.id,
  );
  const [routine, exercises] = await Promise.all([
    preview ? getRoutine(routineRepository, user.id, preview.routineId) : null,
    preview ? exerciseRefs(user.id) : [],
  ]);
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  return {
    id: session.id,
    setCount: session.sets.length,
    routineName: routine?.name ?? null,
    changes: preview?.changes.map((change) => describeRoutineChange(change, names.get(change.exerciseId) ?? "Exercise")) ?? [],
  };
}

/** Finished workouts, newest first. */
export async function loadHistory() {
  const user = await requireUser();
  const [sessions, names] = await Promise.all([listHistory(sessionRepository, user.id), routineNames(user.id)]);
  return sessions.map((session) => toHistoryEntry(session, names));
}

/** A finished workout of the user; null for a missing, foreign or active one. */
export async function loadSessionDetail(id: number) {
  const user = await requireUser();
  const session = await getSession(sessionRepository, user.id, id);
  if (!session || session.finishedAt === null) return null;

  const [names, exercises] = await Promise.all([routineNames(user.id), exerciseRefs(user.id)]);
  return {
    id: session.id,
    title: (session.routineId !== null && names.get(session.routineId)) || FREE_WORKOUT,
    date: formatDate(session.startedAt),
    duration: formatDuration(session.startedAt, session.finishedAt),
    notes: session.notes,
    setCount: session.sets.length,
    groups: groupSets(session.sets, exercises),
  };
}
