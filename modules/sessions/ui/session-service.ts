import "server-only";
import { db } from "@/infrastructure/db/client";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { exerciseRepository } from "@/modules/exercises/ui/exercise-service";
import { routineRepository } from "@/modules/routines/ui/routine-service";
import { DrizzleSessionRepository } from "../infrastructure/drizzle-session-repository";
import { DrizzleSessionUnitOfWork } from "../infrastructure/drizzle-session-unit-of-work";
import {
  exerciseNameFor,
  readActiveSession,
  readActiveSessionId,
  readFinishView,
  readHistory,
  readSessionDetail,
} from "./session-reads";
import type { PrefillSuggestion } from "./session-view";

export { parseSessionId } from "./parse-session-form";

/** Composition root: the one place that picks the MySQL adapters. */
export const sessionRepository = new DrizzleSessionRepository(db);
export const sessionUnitOfWork = new DrizzleSessionUnitOfWork(db);

const repositories = { sessions: sessionRepository, routines: routineRepository, exercises: exerciseRepository };

/** An exercise's name for messages; null when the user does not own it. */
export async function exerciseNameOf(userId: number, exerciseId: number): Promise<string | null> {
  return exerciseNameFor(exerciseRepository, userId, exerciseId);
}

/*
 * Reads for pages. Each one resolves the signed-in user itself and passes
 * only that user's id down, so every read is scoped to them.
 */

/**
 * The active workout screen, or null when no workout is active.
 * `suggestions` are the signed-in user's effective trainer suggestions
 * (coaching's `loadMyPrefillSuggestions`), passed in by the page.
 */
export async function loadActiveSession(suggestions: ReadonlyMap<number, PrefillSuggestion> = new Map()) {
  const user = await requireUser();
  return readActiveSession(repositories, user.id, suggestions);
}

/** The id of the user's active workout, if any, for links. */
export async function loadActiveSessionId(): Promise<number | null> {
  const user = await requireUser();
  return readActiveSessionId(sessionRepository, user.id);
}

/** The finish step: what finishing would add to the routine, as dialog lines. */
export async function loadFinishView() {
  const user = await requireUser();
  return readFinishView(repositories, user.id);
}

/** Finished workouts, newest first. */
export async function loadHistory() {
  const user = await requireUser();
  return readHistory(repositories, user.id);
}

/** A finished workout of the user; null for a missing, foreign or active one. */
export async function loadSessionDetail(id: number) {
  const user = await requireUser();
  return readSessionDetail(repositories, user.id, id);
}
