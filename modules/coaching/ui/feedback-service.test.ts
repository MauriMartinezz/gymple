import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryExerciseRepository } from "@/modules/exercises/testing/in-memory-exercise-repository";
import { InMemorySessionRepository } from "@/modules/sessions/testing/in-memory-session-repository";
import { InMemoryTrainerRepository } from "@/modules/trainers/testing/in-memory-trainer-repository";
import { saveSuggestion, addComment } from "../application/feedback-use-cases";
import { InMemoryCoachingRepository } from "../testing/in-memory-coaching-repository";
import { InMemoryFeedbackRepository } from "../testing/in-memory-feedback-repository";

/*
 * Feedback reads resolve the user from the session. A trainer read is null
 * (not-found) without an active link; a student read only ever covers the
 * session user's own exercises and workouts.
 */

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const state = vi.hoisted(() => ({
  deps: null as unknown as {
    coaching: InMemoryCoachingRepository;
    trainers: InMemoryTrainerRepository;
    feedback: InMemoryFeedbackRepository;
    exercises: InMemoryExerciseRepository;
    sessions: InMemorySessionRepository;
  },
  currentUser: null as null | { id: number; email: string; name: string },
}));

const requireUser = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/infrastructure/session", () => ({ requireUser }));
vi.mock("./coaching-deps", () => ({
  get coachingDeps() {
    return state.deps;
  },
}));

const {
  loadMyPrefillSuggestions,
  loadMySuggestions,
  loadMyWorkoutComments,
  loadOwnWorkoutComments,
  loadStudentSuggestions,
} = await import("./feedback-service");

let ana: number; // active trainer of Bruno
let rita: number; // revoked trainer of Bruno
let bruno: number;
let carla: number;
let squat: number;
let workout: number;

function addPerson(name: string): number {
  const email = `${name.toLowerCase()}@example.com`;
  const id = state.deps.coaching.addUser({ name, email });
  expect(state.deps.trainers.addAccount({ name, email, emailVerified: true })).toBe(id);
  return id;
}

function signIn(id: number | null) {
  state.currentUser = id === null ? null : { id, email: `${id}@example.com`, name: `User ${id}` };
}

beforeEach(async () => {
  const coaching = new InMemoryCoachingRepository();
  state.deps = {
    coaching,
    trainers: new InMemoryTrainerRepository(),
    feedback: new InMemoryFeedbackRepository(coaching),
    exercises: new InMemoryExerciseRepository(),
    sessions: new InMemorySessionRepository(),
  };
  ana = addPerson("Ana");
  rita = addPerson("Rita");
  bruno = addPerson("Bruno");
  carla = addPerson("Carla");
  await state.deps.trainers.certify(ana, "12345678");
  await state.deps.trainers.certify(rita, "2345678");
  await state.deps.coaching.link(ana, bruno);
  await state.deps.coaching.link(rita, bruno);
  const created = await state.deps.exercises.create(bruno, { name: "Squat", muscleGroup: "legs", notes: null });
  squat = created.id;
  state.deps.sessions.addExercise(bruno, squat);
  const session = await state.deps.sessions.start(bruno, null);
  await state.deps.sessions.addSet(bruno, session.id, squat, { weightKg: 100, reps: 5, rpe: null, restSeconds: null });
  workout = (await state.deps.sessions.finish(bruno, session.id, null))!.id;
  await saveSuggestion(state.deps, ana, bruno, squat, { weightKg: "85", reps: "6", sets: "4", note: "Pause" });
  await addComment(state.deps, ana, bruno, workout, "Great depth");
  await addComment(state.deps, rita, bruno, workout, "Solid");
  await state.deps.trainers.setRevoked(rita, true);
  signIn(null);
  requireUser.mockReset().mockImplementation(async () => {
    if (!state.currentUser) throw new RedirectSignal("/login");
    return state.currentUser;
  });
});

describe.each([
  ["loadMySuggestions", () => loadMySuggestions()],
  ["loadMyPrefillSuggestions", () => loadMyPrefillSuggestions()],
  ["loadStudentSuggestions", () => loadStudentSuggestions(3)],
  ["loadOwnWorkoutComments", () => loadOwnWorkoutComments(3, 1)],
  ["loadMyWorkoutComments", () => loadMyWorkoutComments(1)],
] as const)("%s", (_name, load) => {
  it("sends a signed-out user to sign in", async () => {
    await expect(load()).rejects.toBeInstanceOf(RedirectSignal);
  });
});

describe("student reads", () => {
  it("lists the session user's current suggestions", async () => {
    signIn(bruno);

    expect(await loadMySuggestions()).toEqual([
      { trainerId: ana, trainerName: "Ana", exerciseId: squat, exerciseName: "Squat", load: "85 kg × 6", sets: "4 sets", note: "Pause" },
    ]);
    expect((await loadMyPrefillSuggestions()).get(squat)).toMatchObject({ trainerName: "Ana", weightKg: 85, reps: 6 });
  });

  it("never shows another user's suggestions", async () => {
    signIn(carla);

    expect(await loadMySuggestions()).toEqual([]);
    expect(await loadMyPrefillSuggestions()).toEqual(new Map());
  });

  it("shows every trainer's comments on the user's workout, revoked ones included", async () => {
    signIn(bruno);

    expect((await loadMyWorkoutComments(workout)).map((c) => [c.trainerName, c.body])).toEqual([
      ["Ana", "Great depth"],
      ["Rita", "Solid"],
    ]);
    expect((await loadMyWorkoutComments(workout))[0].date).toEqual(expect.any(String));
    signIn(carla);
    expect(await loadMyWorkoutComments(workout)).toEqual([]);
  });
});

describe("trainer reads", () => {
  it("gives the active trainer the student's exercises with their suggestion", async () => {
    signIn(ana);

    expect(await loadStudentSuggestions(bruno)).toEqual([
      { exerciseId: squat, name: "Squat", suggestion: { weightKg: 85, reps: 6, sets: 4, note: "Pause", load: "85 kg × 6" } },
    ]);
  });

  it("gives the active trainer only their own comments", async () => {
    signIn(ana);

    expect((await loadOwnWorkoutComments(bruno, workout))?.map((c) => c.body)).toEqual(["Great depth"]);
  });

  it.each([
    ["a revoked trainer", () => rita],
    ["a non-trainer", () => carla],
    ["the student", () => bruno],
  ])("is null for %s", async (_name, who) => {
    signIn(who());

    expect(await loadStudentSuggestions(bruno)).toBeNull();
    expect(await loadOwnWorkoutComments(bruno, workout)).toBeNull();
  });
});
