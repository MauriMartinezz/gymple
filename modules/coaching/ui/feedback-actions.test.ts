import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryExerciseRepository } from "@/modules/exercises/testing/in-memory-exercise-repository";
import { InMemorySessionRepository } from "@/modules/sessions/testing/in-memory-session-repository";
import { InMemoryTrainerRepository } from "@/modules/trainers/testing/in-memory-trainer-repository";
import { InMemoryCoachingRepository } from "../testing/in-memory-coaching-repository";
import { InMemoryFeedbackRepository } from "../testing/in-memory-feedback-repository";

/*
 * Feedback actions are a trust boundary. The trainer is always the session
 * user (requireUser), never a form field; the form only names the student,
 * exercise, workout or comment, and the use cases check them. A signed-out
 * user, a revoked trainer, or a forged target changes nothing.
 */

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const state = vi.hoisted(() => ({
  coaching: null as unknown as InMemoryCoachingRepository,
  trainers: null as unknown as InMemoryTrainerRepository,
  feedback: null as unknown as InMemoryFeedbackRepository,
  exercises: null as unknown as InMemoryExerciseRepository,
  sessions: null as unknown as InMemorySessionRepository,
  currentUser: null as null | { id: number; email: string; name: string },
}));

const requireUser = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/infrastructure/session", () => ({ requireUser }));
vi.mock("./coaching-deps", () => ({
  get coachingDeps() {
    return {
      coaching: state.coaching,
      trainers: state.trainers,
      feedback: state.feedback,
      exercises: state.exercises,
      sessions: state.sessions,
    };
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/cache", () => ({ refresh }));

const { addCommentAction, deleteCommentAction, saveSuggestionAction, withdrawSuggestionAction } = await import(
  "./feedback-actions"
);

let ana: number; // active trainer of Bruno
let rita: number; // revoked trainer of Bruno
let bruno: number;
let carla: number;
let squat: number;
let carlaSquat: number;
let workout: number;

function addPerson(name: string): number {
  const email = `${name.toLowerCase()}@example.com`;
  const id = state.coaching.addUser({ name, email });
  expect(state.trainers.addAccount({ name, email, emailVerified: true })).toBe(id);
  return id;
}

async function exercise(userId: number, name: string) {
  const created = await state.exercises.create(userId, { name, muscleGroup: "legs", notes: null });
  state.sessions.addExercise(userId, created.id);
  return created.id;
}

function signIn(id: number) {
  state.currentUser = { id, email: `${id}@example.com`, name: `User ${id}` };
}

function form(fields: Record<string, string | number>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, String(value));
  return data;
}

const suggestions = () => state.feedback.listSuggestionsForStudent(bruno);
const comments = () => state.feedback.listComments(workout);

beforeEach(async () => {
  state.coaching = new InMemoryCoachingRepository();
  state.trainers = new InMemoryTrainerRepository();
  state.feedback = new InMemoryFeedbackRepository(state.coaching);
  state.exercises = new InMemoryExerciseRepository();
  state.sessions = new InMemorySessionRepository();
  ana = addPerson("Ana");
  rita = addPerson("Rita");
  bruno = addPerson("Bruno");
  carla = addPerson("Carla");
  await state.trainers.certify(ana, "12345678");
  await state.trainers.certify(rita, "2345678");
  await state.coaching.link(ana, bruno);
  await state.coaching.link(rita, bruno);
  await state.trainers.setRevoked(rita, true);
  squat = await exercise(bruno, "Squat");
  carlaSquat = await exercise(carla, "Squat");
  const session = await state.sessions.start(bruno, null);
  await state.sessions.addSet(bruno, session.id, squat, { weightKg: 100, reps: 5, rpe: null, restSeconds: null });
  workout = (await state.sessions.finish(bruno, session.id, null))!.id;
  state.currentUser = null;
  refresh.mockReset();
  requireUser.mockReset().mockImplementation(async () => {
    if (!state.currentUser) throw new RedirectSignal("/login");
    return state.currentUser;
  });
});

const suggestionForm = (overrides: Record<string, string | number> = {}) =>
  form({ studentId: bruno, exerciseId: squat, weightKg: "85", reps: "6", sets: "4", note: "Pause", ...overrides });

describe("saveSuggestionAction", () => {
  it("saves the session trainer's suggestion, ignoring a forged trainer id", async () => {
    signIn(ana);

    const result = await saveSuggestionAction({ errors: {}, values: null }, suggestionForm({ trainerId: rita }));

    expect(result).toEqual({ errors: {}, values: null });
    expect(requireUser).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await suggestions()).toEqual([
      expect.objectContaining({ trainerId: ana, exerciseId: squat, weightKg: 85, reps: 6, sets: 4, note: "Pause" }),
    ]);
  });

  it("returns field errors with the submitted values", async () => {
    signIn(ana);

    const result = await saveSuggestionAction({ errors: {}, values: null }, suggestionForm({ reps: "0" }));

    expect(result).toEqual({
      errors: { reps: "Reps must be a whole number from 1 to 100." },
      values: { weightKg: "85", reps: "0", sets: "4", note: "Pause" },
    });
    expect(await suggestions()).toEqual([]);
  });

  it.each([
    ["a revoked trainer", () => rita, () => suggestionForm()],
    ["a non-trainer", () => carla, () => suggestionForm()],
    ["another student's exercise", () => ana, () => suggestionForm({ exerciseId: carlaSquat })],
    ["an invalid exercise id", () => ana, () => suggestionForm({ exerciseId: "abc" })],
    ["an invalid student id", () => ana, () => suggestionForm({ studentId: "-1" })],
  ])("rejects %s like a missing target and changes nothing", async (_name, who, data) => {
    signIn(who());

    const result = await saveSuggestionAction({ errors: {}, values: null }, data());

    expect(result.errors).toEqual({ form: "This exercise is no longer available." });
    expect(await suggestions()).toEqual([]);
    expect(await state.feedback.listSuggestionsForStudent(carla)).toEqual([]);
  });

  it("rejects a signed-out user and changes nothing", async () => {
    await expect(saveSuggestionAction({ errors: {}, values: null }, suggestionForm())).rejects.toBeInstanceOf(
      RedirectSignal,
    );
    expect(await suggestions()).toEqual([]);
  });
});

describe("withdrawSuggestionAction", () => {
  beforeEach(async () => {
    signIn(ana);
    await saveSuggestionAction({ errors: {}, values: null }, suggestionForm());
    refresh.mockReset();
  });

  it("withdraws the session trainer's suggestion", async () => {
    await withdrawSuggestionAction(form({ studentId: bruno, exerciseId: squat }));

    expect(await suggestions()).toEqual([]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing for another user or a signed-out user", async () => {
    signIn(carla);
    await withdrawSuggestionAction(form({ studentId: bruno, exerciseId: squat, trainerId: ana }));
    state.currentUser = null;
    await expect(withdrawSuggestionAction(form({ studentId: bruno, exerciseId: squat }))).rejects.toBeInstanceOf(
      RedirectSignal,
    );

    expect(await suggestions()).toHaveLength(1);
  });
});

describe("addCommentAction", () => {
  it("adds the session trainer's comment to the student's finished workout", async () => {
    signIn(ana);

    const result = await addCommentAction({ error: undefined, value: "" }, form({ studentId: bruno, sessionId: workout, body: " Nice " }));

    expect(result).toEqual({ value: "" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await comments()).toEqual([expect.objectContaining({ trainerId: ana, body: "Nice" })]);
  });

  it("returns the validation error with the text", async () => {
    signIn(ana);

    expect(await addCommentAction({ value: "" }, form({ studentId: bruno, sessionId: workout, body: "  " }))).toEqual({
      error: "Write a comment.",
      value: "  ",
    });
    expect(await comments()).toEqual([]);
  });

  it.each([
    ["a revoked trainer", () => rita, () => ({ studentId: bruno, sessionId: workout })],
    ["a non-trainer", () => carla, () => ({ studentId: bruno, sessionId: workout })],
    ["a workout that is not the student's", () => ana, () => ({ studentId: bruno, sessionId: 999 })],
  ])("rejects %s like a missing target", async (_name, who, target) => {
    signIn(who());

    const result = await addCommentAction({ value: "" }, form({ ...target(), body: "Hi" }));

    expect(result).toEqual({ error: "This workout is no longer available.", value: "Hi" });
    expect(await comments()).toEqual([]);
  });

  it("rejects a signed-out user and changes nothing", async () => {
    await expect(
      addCommentAction({ value: "" }, form({ studentId: bruno, sessionId: workout, body: "Hi" })),
    ).rejects.toBeInstanceOf(RedirectSignal);
    expect(await comments()).toEqual([]);
  });
});

describe("deleteCommentAction", () => {
  let commentId: number;

  beforeEach(async () => {
    signIn(ana);
    await addCommentAction({ value: "" }, form({ studentId: bruno, sessionId: workout, body: "Mine" }));
    commentId = (await comments())[0].id;
    refresh.mockReset();
  });

  it("deletes the session trainer's own comment", async () => {
    await deleteCommentAction(form({ studentId: bruno, sessionId: workout, commentId }));

    expect(await comments()).toEqual([]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing for another user, a revoked author or a signed-out user", async () => {
    signIn(carla);
    await deleteCommentAction(form({ studentId: bruno, sessionId: workout, commentId }));
    await state.trainers.setRevoked(ana, true);
    signIn(ana);
    await deleteCommentAction(form({ studentId: bruno, sessionId: workout, commentId }));
    state.currentUser = null;
    await expect(deleteCommentAction(form({ studentId: bruno, sessionId: workout, commentId }))).rejects.toBeInstanceOf(
      RedirectSignal,
    );

    expect(await comments()).toHaveLength(1);
  });
});
