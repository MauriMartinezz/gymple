import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { exercises, routineExercises, routines, sessionSets, users, workoutSessions } from "@/infrastructure/db/schema";
import type { GuestImportWriteResult, GuestImportWriter, ImportCounts } from "../application/import-guest-data";
import type { GuestImportPlan } from "../domain/guest-import-plan";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Writes a guest import plan in one MySQL transaction: an error anywhere
 * rolls back everything. Every row gets a new auto-increment id and the
 * signed-in user's id; references are rewritten through maps built here, so
 * a row can only point at rows of the same user.
 */
export class DrizzleGuestImportWriter implements GuestImportWriter {
  constructor(private readonly db: Db) {}

  write(userId: number, plan: GuestImportPlan): Promise<GuestImportWriteResult> {
    return this.db.transaction(async (tx) => {
      // Same lock as starting a workout, so the "at most one active" check cannot race.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const counts: ImportCounts = { exercises: 0, matchedExercises: 0, routines: 0, workouts: 0, sets: 0 };

      const exerciseIds = new Map<number, number>();
      for (const exercise of plan.exercises) {
        const existing = await findExerciseByName(tx, userId, exercise.input.name);
        if (existing !== null) {
          exerciseIds.set(exercise.key, existing);
          counts.matchedExercises += 1;
          continue;
        }
        const [{ id }] = await tx
          .insert(exercises)
          .values({ userId, ...exercise.input, archivedAt: exercise.archivedAt })
          .$returningId();
        exerciseIds.set(exercise.key, id);
        counts.exercises += 1;
      }

      const routineIds = new Map<number, number>();
      for (const routine of plan.routines) {
        const { items, ...fields } = routine.input;
        const [{ id }] = await tx
          .insert(routines)
          .values({ userId, ...fields, archivedAt: routine.archivedAt })
          .$returningId();
        routineIds.set(routine.key, id);
        await tx.insert(routineExercises).values(
          items.map((item, position) => ({ ...item, routineId: id, position, exerciseId: mapped(exerciseIds, item.exerciseId) })),
        );
        counts.routines += 1;
      }

      const [active] = await tx
        .select({ id: workoutSessions.id })
        .from(workoutSessions)
        .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.finishedAt)))
        .limit(1);
      let activeWorkoutSkipped = false;
      for (const workout of plan.workouts) {
        if (workout.finishedAt === null && active) {
          activeWorkoutSkipped = true;
          continue;
        }
        const [{ id }] = await tx
          .insert(workoutSessions)
          .values({
            userId,
            routineId: workout.routineKey === null ? null : mapped(routineIds, workout.routineKey),
            startedAt: workout.startedAt,
            finishedAt: workout.finishedAt,
            notes: workout.notes,
          })
          .$returningId();
        // Numbered per stored exercise (1..n in logging order): two guest
        // exercises mapped to one account exercise share one sequence.
        const numbers = new Map<number, number>();
        await tx.insert(sessionSets).values(
          workout.sets.map((set) => {
            const exerciseId = mapped(exerciseIds, set.exerciseKey);
            const setNumber = (numbers.get(exerciseId) ?? 0) + 1;
            numbers.set(exerciseId, setNumber);
            return {
              sessionId: id,
              exerciseId,
              setNumber,
              weightKg: set.input.weightKg.toFixed(2),
              reps: set.input.reps,
              rpe: set.input.rpe === null ? null : set.input.rpe.toFixed(1),
              restSeconds: set.input.restSeconds,
              completedAt: set.completedAt,
            };
          }),
        );
        counts.workouts += 1;
        counts.sets += workout.sets.length;
      }

      return { counts, activeWorkoutSkipped };
    });
  }
}

/**
 * The account's exercise with this name, compared by the column's collation:
 * exactly what the `exercises_user_name_uq` index treats as the same name
 * (also catching two guest exercises that collide only by letter case).
 */
async function findExerciseByName(tx: Tx, userId: number, name: string): Promise<number | null> {
  const [row] = await tx
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.userId, userId), eq(exercises.name, name)))
    .limit(1);
  return row?.id ?? null;
}

/** The plan only holds references to its own records; anything else is a bug, so abort the transaction. */
function mapped(ids: Map<number, number>, key: number): number {
  const id = ids.get(key);
  if (id === undefined) throw new Error(`Guest import plan references unknown record ${key}.`);
  return id;
}
