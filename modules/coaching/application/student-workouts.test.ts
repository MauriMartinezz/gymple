import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryExerciseRepository } from "@/modules/exercises/testing/in-memory-exercise-repository";
import { InMemoryRoutineRepository } from "@/modules/routines/testing/in-memory-routine-repository";
import { InMemorySessionRepository } from "@/modules/sessions/testing/in-memory-session-repository";
import { InMemoryTrainerRepository } from "@/modules/trainers/testing/in-memory-trainer-repository";
import { InMemoryCoachingRepository } from "../testing/in-memory-coaching-repository";
import { getStudentHistory, getStudentWorkout, type StudentWorkoutDeps } from "./student-workouts";

const SET = { weightKg: 80, reps: 8, rpe: null, restSeconds: 90 };

let coaching: InMemoryCoachingRepository;
let trainers: InMemoryTrainerRepository;
let sessions: InMemorySessionRepository;
let exercises: InMemoryExerciseRepository;
let routines: InMemoryRoutineRepository;
let deps: StudentWorkoutDeps;

let ana: number; // active trainer
let bruno: number; // Ana's student
let carla: number; // not a student
let rita: number; // revoked trainer, Bruno's trainer too

function addPerson(name: string): number {
  const email = `${name.toLowerCase()}@example.com`;
  const id = coaching.addUser({ name, email });
  expect(trainers.addAccount({ name, email, emailVerified: true })).toBe(id);
  return id;
}

/** A finished workout of `userId` with one set of a new exercise, from a routine when given. */
async function finishedWorkout(userId: number, exerciseName: string, routineName?: string) {
  const exercise = await exercises.create(userId, { name: exerciseName, muscleGroup: "chest", notes: null });
  sessions.addExercise(userId, exercise.id);
  let routineId: number | null = null;
  if (routineName) {
    routines.addExercise(userId, exercise.id);
    routineId = (await routines.create(userId, { name: routineName, description: null, items: [] })).id;
    sessions.addRoutine(userId, routineId);
  }
  const session = await sessions.start(userId, routineId);
  await sessions.addSet(userId, session.id, exercise.id, SET);
  return { session: (await sessions.finish(userId, session.id, "Felt strong"))!, exercise };
}

beforeEach(async () => {
  coaching = new InMemoryCoachingRepository();
  trainers = new InMemoryTrainerRepository();
  sessions = new InMemorySessionRepository();
  exercises = new InMemoryExerciseRepository();
  routines = new InMemoryRoutineRepository();
  deps = { coaching, trainers, sessions, exercises, routines };

  ana = addPerson("Ana");
  bruno = addPerson("Bruno");
  carla = addPerson("Carla");
  rita = addPerson("Rita");
  await trainers.certify(ana, "12345678");
  await trainers.certify(rita, "2345678");
  await trainers.setRevoked(rita, true);
  await coaching.link(ana, bruno);
  await coaching.link(rita, bruno);
});

describe("getStudentHistory", () => {
  it("gives an active trainer the student's finished workouts, exercise and routine names", async () => {
    const first = await finishedWorkout(bruno, "Bench press", "Push");
    const second = await finishedWorkout(bruno, "Squat");

    const history = await getStudentHistory(deps, ana, bruno);

    expect(history?.student).toEqual({ userId: bruno, name: "Bruno", email: "bruno@example.com" });
    expect(history?.sessions.map((s) => s.id)).toEqual([second.session.id, first.session.id]);
    expect(history?.exercises).toEqual([
      { id: first.exercise.id, name: "Bench press", archived: false },
      { id: second.exercise.id, name: "Squat", archived: false },
    ]);
    expect(history?.routineNames).toEqual(new Map([[first.session.routineId!, "Push"]]));
  });

  it("never includes the student's active workout", async () => {
    const done = await finishedWorkout(bruno, "Bench press");
    await sessions.start(bruno, null);

    expect((await getStudentHistory(deps, ana, bruno))?.sessions.map((s) => s.id)).toEqual([done.session.id]);
  });

  it("denies a trainer who is not linked to the user", async () => {
    await finishedWorkout(carla, "Deadlift");

    expect(await getStudentHistory(deps, ana, carla)).toBeNull();
  });

  it("denies a revoked trainer, even with a link", async () => {
    await finishedWorkout(bruno, "Bench press");

    expect(await getStudentHistory(deps, rita, bruno)).toBeNull();
  });

  it("denies a plain user and the reverse direction", async () => {
    await finishedWorkout(ana, "Row");

    expect(await getStudentHistory(deps, carla, bruno)).toBeNull();
    expect(await getStudentHistory(deps, bruno, ana)).toBeNull();
  });

  it("denies after the student leaves", async () => {
    await coaching.unlink(ana, bruno);

    expect(await getStudentHistory(deps, ana, bruno)).toBeNull();
  });
});

describe("getStudentWorkout", () => {
  it("gives an active trainer one finished workout with exercise and routine names", async () => {
    const { session, exercise } = await finishedWorkout(bruno, "Bench press", "Push");

    const workout = await getStudentWorkout(deps, ana, bruno, session.id);

    expect(workout?.student.userId).toBe(bruno);
    expect(workout?.session).toEqual(session);
    expect(workout?.exercises).toEqual([{ id: exercise.id, name: "Bench press", archived: false }]);
    expect(workout?.routineName).toBe("Push");
  });

  it("treats the student's active workout as missing", async () => {
    await finishedWorkout(bruno, "Bench press");
    const active = await sessions.start(bruno, null);

    expect(await getStudentWorkout(deps, ana, bruno, active.id)).toBeNull();
  });

  it("treats another user's workout as missing, even when that user is a student too", async () => {
    await coaching.link(ana, carla);
    const carlas = await finishedWorkout(carla, "Deadlift");

    expect(await getStudentWorkout(deps, ana, bruno, carlas.session.id)).toBeNull();
    expect(await getStudentWorkout(deps, ana, carla, carlas.session.id)).not.toBeNull();
  });

  it("denies a non-student and a revoked trainer", async () => {
    const carlas = await finishedWorkout(carla, "Deadlift");
    const brunos = await finishedWorkout(bruno, "Bench press");

    expect(await getStudentWorkout(deps, ana, carla, carlas.session.id)).toBeNull();
    expect(await getStudentWorkout(deps, rita, bruno, brunos.session.id)).toBeNull();
  });
});
