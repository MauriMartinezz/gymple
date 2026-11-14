import type { Exercise } from "@/modules/exercises/domain/exercise";
import type { ExerciseOption } from "./routine-form";

/**
 * Choices for the exercise picker: the user's active exercises, plus archived
 * ones the routine already uses so they can be kept.
 */
export function toExerciseOptions(
  { active, archived }: { active: Exercise[]; archived: Exercise[] },
  usedExerciseIds: number[] = [],
): ExerciseOption[] {
  const used = new Set(usedExerciseIds);
  return [
    ...active.map((exercise) => ({ id: exercise.id, name: exercise.name, archived: false })),
    ...archived
      .filter((exercise) => used.has(exercise.id))
      .map((exercise) => ({ id: exercise.id, name: exercise.name, archived: true })),
  ];
}
