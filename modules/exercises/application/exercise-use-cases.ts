import {
  validateExerciseInput,
  type Exercise,
  type ExerciseErrors,
  type RawExerciseInput,
} from "../domain/exercise";
import { DuplicateExerciseNameError, type ExerciseRepository } from "../domain/exercise-repository";

export type ExerciseCommandResult =
  | { ok: true; exercise: Exercise }
  | { ok: false; reason: "invalid"; errors: ExerciseErrors }
  | { ok: false; reason: "not_found" };

export async function listExercises(repo: ExerciseRepository, userId: number) {
  const [active, archived] = await Promise.all([
    repo.list(userId, { archived: false }),
    repo.list(userId, { archived: true }),
  ]);
  return { active, archived };
}

export function getExercise(repo: ExerciseRepository, userId: number, id: number) {
  return repo.findById(userId, id);
}

export async function createExercise(
  repo: ExerciseRepository,
  userId: number,
  raw: RawExerciseInput,
): Promise<ExerciseCommandResult> {
  const validation = validateExerciseInput(raw);
  if (!validation.ok) return { ok: false, reason: "invalid", errors: validation.errors };

  return withDuplicateNameHandling(async () => ({
    ok: true,
    exercise: await repo.create(userId, validation.value),
  }));
}

export async function updateExercise(
  repo: ExerciseRepository,
  userId: number,
  id: number,
  raw: RawExerciseInput,
): Promise<ExerciseCommandResult> {
  const validation = validateExerciseInput(raw);
  if (!validation.ok) return { ok: false, reason: "invalid", errors: validation.errors };

  return withDuplicateNameHandling(async () => {
    const exercise = await repo.update(userId, id, validation.value);
    return exercise ? { ok: true, exercise } : { ok: false, reason: "not_found" };
  });
}

export function archiveExercise(repo: ExerciseRepository, userId: number, id: number) {
  return repo.setArchived(userId, id, true);
}

export function restoreExercise(repo: ExerciseRepository, userId: number, id: number) {
  return repo.setArchived(userId, id, false);
}

async function withDuplicateNameHandling(
  run: () => Promise<ExerciseCommandResult>,
): Promise<ExerciseCommandResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DuplicateExerciseNameError) {
      return {
        ok: false,
        reason: "invalid",
        errors: { name: `You already have an exercise named "${error.exerciseName}".` },
      };
    }
    throw error;
  }
}
