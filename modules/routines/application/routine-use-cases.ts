import {
  validateRoutineInput,
  type RawRoutineInput,
  type Routine,
  type RoutineErrors,
  type RoutineInput,
  type RoutineItemErrors,
} from "../domain/routine";
import { UnknownExerciseError, type RoutineRepository } from "../domain/routine-repository";

export type RoutineCommandResult =
  | { ok: true; routine: Routine }
  | { ok: false; reason: "invalid"; errors: RoutineErrors }
  | { ok: false; reason: "not_found" };

export async function listRoutines(repo: RoutineRepository, userId: number) {
  const [active, archived] = await Promise.all([
    repo.list(userId, { archived: false }),
    repo.list(userId, { archived: true }),
  ]);
  return { active, archived };
}

export function getRoutine(repo: RoutineRepository, userId: number, id: number) {
  return repo.findById(userId, id);
}

export async function createRoutine(
  repo: RoutineRepository,
  userId: number,
  raw: RawRoutineInput,
): Promise<RoutineCommandResult> {
  const validation = validateRoutineInput(raw);
  if (!validation.ok) return { ok: false, reason: "invalid", errors: validation.errors };

  return withUnknownExerciseHandling(validation.value, async () => ({
    ok: true,
    routine: await repo.create(userId, validation.value),
  }));
}

export async function updateRoutine(
  repo: RoutineRepository,
  userId: number,
  id: number,
  raw: RawRoutineInput,
): Promise<RoutineCommandResult> {
  const validation = validateRoutineInput(raw);
  if (!validation.ok) return { ok: false, reason: "invalid", errors: validation.errors };

  return withUnknownExerciseHandling(validation.value, async () => {
    const routine = await repo.update(userId, id, validation.value);
    return routine ? { ok: true, routine } : { ok: false, reason: "not_found" };
  });
}

export function archiveRoutine(repo: RoutineRepository, userId: number, id: number) {
  return repo.setArchived(userId, id, true);
}

export function restoreRoutine(repo: RoutineRepository, userId: number, id: number) {
  return repo.setArchived(userId, id, false);
}

async function withUnknownExerciseHandling(
  input: RoutineInput,
  run: () => Promise<RoutineCommandResult>,
): Promise<RoutineCommandResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof UnknownExerciseError) {
      const unknown = new Set(error.itemIndexes);
      const itemErrors = input.items.map((_, index): RoutineItemErrors | undefined =>
        unknown.has(index) ? { exerciseId: "Choose one of your exercises." } : undefined,
      );
      return { ok: false, reason: "invalid", errors: { itemErrors } };
    }
    throw error;
  }
}
