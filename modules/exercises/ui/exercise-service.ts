import "server-only";
import { db } from "@/infrastructure/db/client";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { getExercise, listExercises } from "../application/exercise-use-cases";
import { DrizzleExerciseRepository } from "../infrastructure/drizzle-exercise-repository";

export { parseExerciseId } from "./parse-exercise-id";

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
