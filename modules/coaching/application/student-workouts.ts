import type { ExerciseRepository } from "@/modules/exercises/domain/exercise-repository";
import type { RoutineRepository } from "@/modules/routines/domain/routine-repository";
import type { WorkoutSession } from "@/modules/sessions/domain/session";
import type { SessionRepository } from "@/modules/sessions/domain/session-repository";
import type { Person } from "../domain/coaching-repository";
import { findCoachedStudent, type CoachingDeps } from "./coaching-use-cases";

/*
 * A trainer's read-only view of a student's training (S11): finished workouts
 * and the names they need. Every read starts with the access check; for a
 * non-student or a revoked trainer the result is null, like a missing page.
 * Active workouts are never returned, and nothing here can change data.
 */

export interface StudentWorkoutDeps extends CoachingDeps {
  sessions: Pick<SessionRepository, "listFinished" | "findById">;
  exercises: Pick<ExerciseRepository, "list">;
  routines: Pick<RoutineRepository, "list">;
}

export interface ExerciseName {
  id: number;
  name: string;
  archived: boolean;
}

export interface StudentHistory {
  student: Person;
  /** Finished only, newest first. */
  sessions: WorkoutSession[];
  exercises: ExerciseName[];
  routineNames: Map<number, string>;
}

export interface StudentWorkout {
  student: Person;
  session: WorkoutSession;
  exercises: ExerciseName[];
  routineName: string | null;
}

export async function getStudentHistory(
  deps: StudentWorkoutDeps,
  trainerId: number,
  studentId: number,
): Promise<StudentHistory | null> {
  const student = await findCoachedStudent(deps, trainerId, studentId);
  if (!student) return null;

  const [sessions, exercises, routineNames] = await Promise.all([
    deps.sessions.listFinished(student.userId),
    exerciseNames(deps, student.userId),
    routineNamesOf(deps, student.userId),
  ]);
  return { student, sessions, exercises, routineNames };
}

/** One finished workout of the student; null when missing, active, or another user's. */
export async function getStudentWorkout(
  deps: StudentWorkoutDeps,
  trainerId: number,
  studentId: number,
  sessionId: number,
): Promise<StudentWorkout | null> {
  const student = await findCoachedStudent(deps, trainerId, studentId);
  if (!student) return null;

  // Scoped to the student: another user's session id is missing here.
  const session = await deps.sessions.findById(student.userId, sessionId);
  if (!session || session.finishedAt === null) return null;

  const [exercises, routineNames] = await Promise.all([
    exerciseNames(deps, student.userId),
    routineNamesOf(deps, student.userId),
  ]);
  return {
    student,
    session,
    exercises,
    routineName: session.routineId === null ? null : (routineNames.get(session.routineId) ?? null),
  };
}

async function exerciseNames(deps: StudentWorkoutDeps, userId: number): Promise<ExerciseName[]> {
  const [active, archived] = await Promise.all([
    deps.exercises.list(userId, { archived: false }),
    deps.exercises.list(userId, { archived: true }),
  ]);
  return [
    ...active.map((e) => ({ id: e.id, name: e.name, archived: false })),
    ...archived.map((e) => ({ id: e.id, name: e.name, archived: true })),
  ];
}

async function routineNamesOf(deps: StudentWorkoutDeps, userId: number): Promise<Map<number, string>> {
  const [active, archived] = await Promise.all([
    deps.routines.list(userId, { archived: false }),
    deps.routines.list(userId, { archived: true }),
  ]);
  return new Map([...active, ...archived].map((r) => [r.id, r.name]));
}
