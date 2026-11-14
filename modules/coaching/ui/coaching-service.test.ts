import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryExerciseRepository } from "@/modules/exercises/testing/in-memory-exercise-repository";
import { InMemoryRoutineRepository } from "@/modules/routines/testing/in-memory-routine-repository";
import { InMemorySessionRepository } from "@/modules/sessions/testing/in-memory-session-repository";
import { InMemoryTrainerRepository } from "@/modules/trainers/testing/in-memory-trainer-repository";
import { InMemoryCoachingRepository } from "../testing/in-memory-coaching-repository";

/*
 * Page reads are a trust boundary too: each loader resolves the user from the
 * session and returns null (the page shows not-found) for a non-student or a
 * revoked trainer. Active workouts never reach the trainer.
 */

const CODE = "abcdef0123456789abcdef0123456789";

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const state = vi.hoisted(() => ({
  coaching: null as unknown as InMemoryCoachingRepository,
  trainers: null as unknown as InMemoryTrainerRepository,
  sessions: null as unknown as InMemorySessionRepository,
  exercises: null as unknown as InMemoryExerciseRepository,
  routines: null as unknown as InMemoryRoutineRepository,
  currentUser: null as null | { id: number; email: string; name: string },
}));

const requireUser = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/infrastructure/session", () => ({ requireUser, getCurrentUser }));
vi.mock("./coaching-deps", () => ({
  get coachingDeps() {
    return {
      coaching: state.coaching,
      trainers: state.trainers,
      sessions: state.sessions,
      exercises: state.exercises,
      routines: state.routines,
      newCode: () => CODE,
    };
  },
}));

const {
  isCurrentUserActiveTrainer,
  loadJoinPreview,
  loadMyTrainers,
  loadStudentHistory,
  loadStudentWorkout,
  loadTrainerDashboard,
} = await import("./coaching-service");

let ana: number; // active trainer
let bruno: number; // Ana's student
let carla: number; // nobody's student
let rita: number; // revoked trainer, also Bruno's

function addPerson(name: string): number {
  const email = `${name.toLowerCase()}@example.com`;
  const id = state.coaching.addUser({ name, email });
  expect(state.trainers.addAccount({ name, email, emailVerified: true })).toBe(id);
  return id;
}

function signIn(id: number | null) {
  state.currentUser = id === null ? null : { id, email: `${id}@example.com`, name: `User ${id}` };
}

async function finishedWorkout(userId: number, exerciseName: string) {
  const exercise = await state.exercises.create(userId, { name: exerciseName, muscleGroup: "legs", notes: null });
  state.sessions.addExercise(userId, exercise.id);
  const session = await state.sessions.start(userId, null);
  await state.sessions.addSet(userId, session.id, exercise.id, { weightKg: 100, reps: 5, rpe: 8, restSeconds: 120 });
  return (await state.sessions.finish(userId, session.id, "Heavy day"))!;
}

beforeEach(async () => {
  state.coaching = new InMemoryCoachingRepository();
  state.trainers = new InMemoryTrainerRepository();
  state.sessions = new InMemorySessionRepository();
  state.exercises = new InMemoryExerciseRepository();
  state.routines = new InMemoryRoutineRepository();
  ana = addPerson("Ana");
  bruno = addPerson("Bruno");
  carla = addPerson("Carla");
  rita = addPerson("Rita");
  await state.trainers.certify(ana, "12345678");
  await state.trainers.certify(rita, "2345678");
  await state.trainers.setRevoked(rita, true);
  await state.coaching.link(ana, bruno);
  await state.coaching.link(rita, bruno);
  signIn(null);
  requireUser.mockReset().mockImplementation(async () => {
    if (!state.currentUser) throw new RedirectSignal("/login");
    return state.currentUser;
  });
  getCurrentUser.mockReset().mockImplementation(async () => state.currentUser);
});

const signedOutLoaders = [
  ["loadMyTrainers", () => loadMyTrainers()],
  ["loadTrainerDashboard", () => loadTrainerDashboard()],
  ["loadJoinPreview", () => loadJoinPreview(CODE)],
  ["loadStudentHistory", () => loadStudentHistory(2)],
  ["loadStudentWorkout", () => loadStudentWorkout(2, 1)],
] as const;

describe.each(signedOutLoaders)("%s", (_name, load) => {
  it("sends a signed-out user to sign in", async () => {
    await expect(load()).rejects.toBeInstanceOf(RedirectSignal);
  });
});

describe("loadMyTrainers", () => {
  it("lists the session user's trainers with their status", async () => {
    signIn(bruno);

    expect(await loadMyTrainers()).toEqual([
      { userId: rita, name: "Rita", status: "inactive" },
      { userId: ana, name: "Ana", status: "active" },
    ]);
  });
});

describe("loadTrainerDashboard", () => {
  it("gives an active trainer their invite path and students", async () => {
    signIn(ana);

    expect(await loadTrainerDashboard()).toEqual({
      invitePath: `/join/${CODE}`,
      students: [{ userId: bruno, name: "Bruno", email: "bruno@example.com" }],
    });
  });

  it("is null for a plain user and a revoked trainer", async () => {
    signIn(carla);
    expect(await loadTrainerDashboard()).toBeNull();
    signIn(rita);
    expect(await loadTrainerDashboard()).toBeNull();
  });
});

describe("isCurrentUserActiveTrainer", () => {
  it("is true only for a signed-in active trainer", async () => {
    expect(await isCurrentUserActiveTrainer()).toBe(false);
    signIn(rita);
    expect(await isCurrentUserActiveTrainer()).toBe(false);
    signIn(ana);
    expect(await isCurrentUserActiveTrainer()).toBe(true);
  });
});

describe("loadJoinPreview", () => {
  it("previews the code for the session user", async () => {
    await state.coaching.saveInviteCode(ana, CODE);
    signIn(carla);

    expect(await loadJoinPreview(CODE)).toEqual({ status: "can_join", trainer: { userId: ana, name: "Ana" } });
  });
});

describe("loadStudentHistory", () => {
  it("shows an active trainer the student's finished workouts", async () => {
    const done = await finishedWorkout(bruno, "Squat");
    await state.sessions.start(bruno, null);
    signIn(ana);

    const view = await loadStudentHistory(bruno);

    expect(view?.student).toEqual({ userId: bruno, name: "Bruno" });
    expect(view?.entries).toEqual([
      expect.objectContaining({ id: done.id, title: "Free workout", exerciseCount: 1, setCount: 1 }),
    ]);
  });

  it.each([
    ["a non-student", () => ({ trainer: ana, student: carla })],
    ["a revoked trainer", () => ({ trainer: rita, student: bruno })],
    ["a plain user", () => ({ trainer: carla, student: bruno })],
  ])("is null for %s", async (_name, who) => {
    const { trainer, student } = who();
    await finishedWorkout(student, "Squat");
    signIn(trainer);

    expect(await loadStudentHistory(student)).toBeNull();
  });
});

describe("loadStudentWorkout", () => {
  it("shows an active trainer a finished workout, read-only", async () => {
    const done = await finishedWorkout(bruno, "Squat");
    signIn(ana);

    const view = await loadStudentWorkout(bruno, done.id);

    expect(view).toMatchObject({
      id: done.id,
      student: { userId: bruno, name: "Bruno" },
      title: "Free workout",
      notes: "Heavy day",
      setCount: 1,
      groups: [{ exerciseId: expect.any(Number), name: "Squat", sets: [expect.objectContaining({ weightKg: 100 })] }],
    });
  });

  it("is null for the student's active workout", async () => {
    await finishedWorkout(bruno, "Squat");
    const active = await state.sessions.start(bruno, null);
    signIn(ana);

    expect(await loadStudentWorkout(bruno, active.id)).toBeNull();
  });

  it("is null for a revoked trainer and a non-student", async () => {
    const brunos = await finishedWorkout(bruno, "Squat");
    const carlas = await finishedWorkout(carla, "Row");

    signIn(rita);
    expect(await loadStudentWorkout(bruno, brunos.id)).toBeNull();
    signIn(ana);
    expect(await loadStudentWorkout(carla, carlas.id)).toBeNull();
    // A non-student's workout id under a real student's id.
    expect(await loadStudentWorkout(bruno, carlas.id)).toBeNull();
  });
});
