import "server-only";
import { db } from "@/infrastructure/db/client";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { loadExercises } from "@/modules/exercises/ui/exercise-service";
import { getRoutine, listRoutines } from "../application/routine-use-cases";
import { DrizzleRoutineRepository } from "../infrastructure/drizzle-routine-repository";
import { toExerciseOptions } from "./exercise-options";
import type { ExerciseOption } from "./routine-form";

export { parseRoutineId } from "./parse-routine-id";

/** Composition root: the one place that picks the Postgres adapter. */
export const routineRepository = new DrizzleRoutineRepository(db);

/** Reads for pages. Each one resolves the signed-in user itself. */
export async function loadRoutines() {
  const user = await requireUser();
  return listRoutines(routineRepository, user.id);
}

export async function loadRoutine(id: number) {
  const user = await requireUser();
  return getRoutine(routineRepository, user.id, id);
}

/**
 * Choices for the exercise picker: the user's active exercises, plus archived
 * ones the routine already uses so they can be kept.
 */
export async function loadExerciseOptions(usedExerciseIds: number[] = []): Promise<ExerciseOption[]> {
  return toExerciseOptions(await loadExercises(), usedExerciseIds);
}
