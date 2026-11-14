import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryExerciseRepository } from "@/modules/exercises/testing/in-memory-exercise-repository";
import { InMemorySessionRepository } from "@/modules/sessions/testing/in-memory-session-repository";
import { InMemoryTrainerRepository } from "@/modules/trainers/testing/in-memory-trainer-repository";
import { InMemoryCoachingRepository } from "../testing/in-memory-coaching-repository";
import { InMemoryFeedbackRepository } from "../testing/in-memory-feedback-repository";
import {
  addComment,
  deleteComment,
  effectiveSuggestions,
  getOwnComments,
  getStudentSuggestions,
  listCommentsOnMyWorkout,
  listMySuggestions,
  saveSuggestion,
  withdrawSuggestion,
  type FeedbackDeps,
} from "./feedback-use-cases";

let deps: FeedbackDeps & {
  coaching: InMemoryCoachingRepository;
  trainers: InMemoryTrainerRepository;
  feedback: InMemoryFeedbackRepository;
  exercises: InMemoryExerciseRepository;
  sessions: InMemorySessionRepository;
};
let clock: number;

let ana: number; // active trainer of Bruno
let dani: number; // active trainer of Bruno
let rita: number; // revoked trainer of Bruno
let tomas: number; // active trainer, not Bruno's
let bruno: number;
let carla: number;
let squat: number; // Bruno's
let bench: number; // Bruno's
let oldPress: number; // Bruno's, archived
let carlaSquat: number;

function addPerson(name: string): number {
  const email = `${name.toLowerCase()}@example.com`;
  const id = deps.coaching.addUser({ name, email });
  expect(deps.trainers.addAccount({ name, email, emailVerified: true })).toBe(id);
  return id;
}

async function exercise(userId: number, name: string, { archived = false } = {}) {
  const created = await deps.exercises.create(userId, { name, muscleGroup: "legs", notes: null });
  deps.sessions.addExercise(userId, created.id);
  if (archived) await deps.exercises.setArchived(userId, created.id, true);
  return created.id;
}

async function finishedWorkout(userId: number, exerciseId: number) {
  const session = await deps.sessions.start(userId, null);
  await deps.sessions.addSet(userId, session.id, exerciseId, { weightKg: 100, reps: 5, rpe: null, restSeconds: null });
  return (await deps.sessions.finish(userId, session.id, null))!.id;
}

const valid = { weightKg: "85", reps: "6", sets: "4", note: " Pause " };

beforeEach(async () => {
  clock = Date.parse("2026-11-14T10:00:00Z");
  const coaching = new InMemoryCoachingRepository();
  deps = {
    coaching,
    trainers: new InMemoryTrainerRepository(),
    feedback: new InMemoryFeedbackRepository(coaching),
    exercises: new InMemoryExerciseRepository(),
    sessions: new InMemorySessionRepository(),
    // Every call is one minute later, so "most recent" is deterministic.
    now: () => new Date((clock += 60_000)),
  };
  ana = addPerson("Ana");
  dani = addPerson("Dani");
  rita = addPerson("Rita");
  tomas = addPerson("Tomas");
  bruno = addPerson("Bruno");
  carla = addPerson("Carla");
  await deps.trainers.certify(ana, "12345678");
  await deps.trainers.certify(dani, "22345678");
  await deps.trainers.certify(rita, "32345678");
  await deps.trainers.certify(tomas, "42345678");
  for (const trainer of [ana, dani, rita]) await deps.coaching.link(trainer, bruno);
  await deps.coaching.link(tomas, carla);
  await deps.trainers.setRevoked(rita, true);
  squat = await exercise(bruno, "Squat");
  bench = await exercise(bruno, "Bench press");
  oldPress = await exercise(bruno, "Old press", { archived: true });
  carlaSquat = await exercise(carla, "Squat");
});

describe("saveSuggestion", () => {
  it("saves an active trainer's suggestion for the student's exercise", async () => {
    expect(await saveSuggestion(deps, ana, bruno, squat, valid)).toEqual({ ok: true });

    expect(await deps.feedback.listSuggestionsForStudent(bruno)).toEqual([
      expect.objectContaining({ trainerId: ana, studentId: bruno, exerciseId: squat, weightKg: 85, reps: 6, sets: 4, note: "Pause" }),
    ]);
  });

  it("replaces the trainer's previous suggestion for that exercise", async () => {
    await saveSuggestion(deps, ana, bruno, squat, valid);
    await saveSuggestion(deps, ana, bruno, squat, { weightKg: "90", reps: "5" });

    expect(await deps.feedback.listSuggestionsForStudent(bruno)).toEqual([
      expect.objectContaining({ trainerId: ana, exerciseId: squat, weightKg: 90, reps: 5, sets: null, note: null }),
    ]);
  });

  it("returns the field errors and saves nothing for invalid values", async () => {
    expect(await saveSuggestion(deps, ana, bruno, squat, { weightKg: "1000", reps: "6", sets: "21" })).toEqual({
      ok: false,
      reason: "invalid",
      errors: {
        weightKg: "Weight must be a number from 0 to 999.99 kg with at most 2 decimals.",
        sets: "Sets must be a whole number from 1 to 20.",
      },
    });
    expect(await deps.feedback.listSuggestionsForStudent(bruno)).toEqual([]);
  });

  it.each([
    ["a trainer who is not the student's", () => [tomas, bruno, squat]],
    ["a revoked trainer", () => [rita, bruno, squat]],
    ["a plain user", () => [carla, bruno, squat]],
    ["the student themselves", () => [bruno, bruno, squat]],
    ["another student's exercise", () => [ana, bruno, carlaSquat]],
    ["an exercise that does not exist", () => [ana, bruno, 999_999]],
    ["an archived exercise", () => [ana, bruno, oldPress]],
  ])("rejects %s like a missing target and changes nothing", async (_name, target) => {
    const [trainer, student, exerciseId] = target();

    expect(await saveSuggestion(deps, trainer, student, exerciseId, valid)).toEqual({ ok: false, reason: "not_found" });
    expect(await deps.feedback.listSuggestionsForStudent(bruno)).toEqual([]);
    expect(await deps.feedback.listSuggestionsForStudent(carla)).toEqual([]);
  });

  it("never changes the student's routines or exercises", async () => {
    const before = await deps.exercises.list(bruno, { archived: false });
    await saveSuggestion(deps, ana, bruno, squat, valid);
    expect(await deps.exercises.list(bruno, { archived: false })).toEqual(before);
  });
});

describe("withdrawSuggestion", () => {
  it("removes only the trainer's suggestion for that exercise", async () => {
    await saveSuggestion(deps, ana, bruno, squat, valid);
    await saveSuggestion(deps, ana, bruno, bench, valid);
    await saveSuggestion(deps, dani, bruno, squat, valid);

    expect(await withdrawSuggestion(deps, ana, bruno, squat)).toBe(true);
    expect(await withdrawSuggestion(deps, ana, bruno, squat)).toBe(false);

    const left = (await deps.feedback.listSuggestionsForStudent(bruno)).map((s) => [s.trainerId, s.exerciseId]);
    expect(left).toHaveLength(2);
    expect(left).toEqual(expect.arrayContaining([[ana, bench], [dani, squat]]));
  });

  it("is refused for a trainer who is not active for the student", async () => {
    await saveSuggestion(deps, ana, bruno, squat, valid);
    await deps.trainers.setRevoked(ana, true);

    expect(await withdrawSuggestion(deps, ana, bruno, squat)).toBe(false);
    expect(await withdrawSuggestion(deps, tomas, bruno, squat)).toBe(false);
    expect(await deps.feedback.listSuggestionsForStudent(bruno)).toHaveLength(1);
  });
});

describe("getStudentSuggestions", () => {
  it("lists the student's active exercises with this trainer's suggestion", async () => {
    await saveSuggestion(deps, ana, bruno, squat, valid);
    await saveSuggestion(deps, dani, bruno, bench, valid);

    const view = await getStudentSuggestions(deps, ana, bruno);

    expect(view?.map((row) => [row.exercise.name, row.suggestion?.weightKg ?? null])).toEqual([
      ["Bench press", null],
      ["Squat", 85],
    ]);
  });

  it("is null for anyone who is not the student's active trainer", async () => {
    expect(await getStudentSuggestions(deps, tomas, bruno)).toBeNull();
    expect(await getStudentSuggestions(deps, rita, bruno)).toBeNull();
    expect(await getStudentSuggestions(deps, carla, bruno)).toBeNull();
  });
});

describe("effectiveSuggestions and listMySuggestions", () => {
  it("picks the most recent suggestion per exercise among active trainers", async () => {
    await saveSuggestion(deps, ana, bruno, squat, { weightKg: "80", reps: "8" });
    await saveSuggestion(deps, dani, bruno, squat, { weightKg: "85", reps: "6" });
    await saveSuggestion(deps, ana, bruno, bench, { weightKg: "60", reps: "10" });

    const effective = await effectiveSuggestions(deps, bruno);

    expect([...effective].map(([id, s]) => [id, s.trainerName, s.weightKg])).toEqual([
      [bench, "Ana", 60],
      [squat, "Dani", 85],
    ]);

    // Replacing makes it the most recent again.
    await saveSuggestion(deps, ana, bruno, squat, { weightKg: "82.5", reps: "7" });
    expect((await effectiveSuggestions(deps, bruno)).get(squat)).toMatchObject({ trainerName: "Ana", weightKg: 82.5 });
  });

  it("ignores and hides a revoked trainer's suggestions, and restores them on re-activation", async () => {
    await saveSuggestion(deps, ana, bruno, squat, { weightKg: "80", reps: "8" });
    await deps.trainers.setRevoked(rita, false);
    await saveSuggestion(deps, rita, bruno, squat, { weightKg: "95", reps: "3" });
    await deps.trainers.setRevoked(rita, true);

    expect((await effectiveSuggestions(deps, bruno)).get(squat)).toMatchObject({ trainerName: "Ana", weightKg: 80 });
    expect((await listMySuggestions(deps, bruno)).map((s) => s.trainerName)).toEqual(["Ana"]);

    await deps.trainers.setRevoked(rita, false);
    expect((await effectiveSuggestions(deps, bruno)).get(squat)).toMatchObject({ trainerName: "Rita", weightKg: 95 });
    expect((await listMySuggestions(deps, bruno)).map((s) => s.trainerName)).toEqual(["Rita", "Ana"]);
  });

  it("stops applying a trainer's suggestions once the student leaves them", async () => {
    await saveSuggestion(deps, ana, bruno, squat, valid);
    await deps.coaching.unlink(ana, bruno);

    expect(await effectiveSuggestions(deps, bruno)).toEqual(new Map());
    expect(await listMySuggestions(deps, bruno)).toEqual([]);
  });

  it("lists the student's suggestions with the exercise name, newest first", async () => {
    await saveSuggestion(deps, ana, bruno, squat, valid);
    await saveSuggestion(deps, dani, bruno, bench, { weightKg: "60", reps: "10" });

    expect(await listMySuggestions(deps, bruno)).toEqual([
      expect.objectContaining({ trainerName: "Dani", exerciseName: "Bench press", weightKg: 60, reps: 10, sets: null, note: null }),
      expect.objectContaining({ trainerName: "Ana", exerciseName: "Squat", weightKg: 85, reps: 6, sets: 4, note: "Pause" }),
    ]);
    expect(await listMySuggestions(deps, carla)).toEqual([]);
  });
});

describe("comments", () => {
  let workout: number;

  beforeEach(async () => {
    workout = await finishedWorkout(bruno, squat);
  });

  it("adds an active trainer's comment to the student's finished workout", async () => {
    const result = await addComment(deps, ana, bruno, workout, "  Great depth  ");

    expect(result).toEqual({
      ok: true,
      comment: expect.objectContaining({ sessionId: workout, trainerId: ana, trainerName: "Ana", body: "Great depth" }),
    });
    expect(await getOwnComments(deps, ana, bruno, workout)).toEqual([expect.objectContaining({ body: "Great depth" })]);
    expect(await listCommentsOnMyWorkout(deps, bruno, workout)).toEqual([
      expect.objectContaining({ trainerName: "Ana", body: "Great depth" }),
    ]);
  });

  it("returns the validation error and saves nothing", async () => {
    expect(await addComment(deps, ana, bruno, workout, "   ")).toEqual({ ok: false, reason: "invalid", error: "Write a comment." });
    expect(await addComment(deps, ana, bruno, workout, "a".repeat(1001))).toEqual({
      ok: false,
      reason: "invalid",
      error: "Comments must be at most 1000 characters.",
    });
    expect(await deps.feedback.listComments(workout)).toEqual([]);
  });

  it("rejects a comment on an active workout like a missing target", async () => {
    const active = await deps.sessions.start(bruno, null);

    expect(await addComment(deps, ana, bruno, active.id, "Keep going")).toEqual({ ok: false, reason: "not_found" });
    expect(await deps.feedback.listComments(active.id)).toEqual([]);
  });

  it.each([
    ["a trainer who is not the student's", () => [tomas, bruno]],
    ["a revoked trainer", () => [rita, bruno]],
    ["a plain user", () => [carla, bruno]],
    ["another student's workout", () => [tomas, carla]],
  ])("rejects %s like a missing target", async (_name, target) => {
    const [trainer, student] = target();

    expect(await addComment(deps, trainer, student, workout, "Hi")).toEqual({ ok: false, reason: "not_found" });
    expect(await deps.feedback.listComments(workout)).toEqual([]);
  });

  it("lets a trainer delete only their own comment", async () => {
    const own = await addComment(deps, ana, bruno, workout, "Mine");
    const other = await addComment(deps, dani, bruno, workout, "Dani's");
    if (!own.ok || !other.ok) throw new Error("setup");

    expect(await deleteComment(deps, ana, bruno, workout, other.comment.id)).toBe(false);
    expect(await deleteComment(deps, ana, bruno, workout, own.comment.id)).toBe(true);

    expect((await listCommentsOnMyWorkout(deps, bruno, workout)).map((c) => c.body)).toEqual(["Dani's"]);
  });

  it("keeps a revoked trainer's comments readable by the student, but they cannot add or delete", async () => {
    const own = await addComment(deps, rita, bruno, workout, "Before");
    expect(own.ok).toBe(false);
    await deps.trainers.setRevoked(rita, false);
    const written = await addComment(deps, rita, bruno, workout, "Solid");
    if (!written.ok) throw new Error("setup");
    await deps.trainers.setRevoked(rita, true);

    expect(await addComment(deps, rita, bruno, workout, "Again")).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteComment(deps, rita, bruno, workout, written.comment.id)).toBe(false);
    expect(await getOwnComments(deps, rita, bruno, workout)).toBeNull();
    expect(await listCommentsOnMyWorkout(deps, bruno, workout)).toEqual([
      expect.objectContaining({ trainerName: "Rita", body: "Solid" }),
    ]);
  });

  it("shows the student only comments on their own finished workouts", async () => {
    await addComment(deps, ana, bruno, workout, "Mine");

    expect(await listCommentsOnMyWorkout(deps, carla, workout)).toEqual([]);
    expect(await listCommentsOnMyWorkout(deps, bruno, 999_999)).toEqual([]);
  });

  it("hides the comments once the workout is deleted", async () => {
    await addComment(deps, ana, bruno, workout, "Mine");
    await deps.sessions.deleteFinished(bruno, workout);

    expect(await listCommentsOnMyWorkout(deps, bruno, workout)).toEqual([]);
    expect(await getOwnComments(deps, ana, bruno, workout)).toBeNull();
  });
});
