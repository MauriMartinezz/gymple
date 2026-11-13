import "server-only";
import { db } from "@/infrastructure/db/client";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { getExercise, listExercises } from "../application/exercise-use-cases";
import { DrizzleExerciseRepository } from "../infrastructure/drizzle-exercise-repository";

/** Composition root: the one place that picks the MySQL adapter. */
export const exerciseRepository = new DrizzleExerciseRepository(db);

/** Reads for pages. Each one resolves the signed-in user itself. */
export async function loadExercises() {
  const user = await requireUser();
  return listExercises(exerciseRepository, user.id);
}

export async function loadExercise(id: number) {
  const user = await requireUser();
  return getExercise(exerciseRepository, user.id, id);
}

/** Route and form ids arrive as strings; anything but a positive integer is "not found". */
export function parseExerciseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
