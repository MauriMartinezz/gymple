import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserExerciseRepository } from "../infrastructure/browser-exercise-repository";
import { BrowserRoutineRepository } from "../infrastructure/browser-routine-repository";
import { BrowserSessionRepository } from "../infrastructure/browser-session-repository";
import { BrowserSessionUnitOfWork } from "../infrastructure/browser-session-unit-of-work";
import { GUEST_USER_ID } from "../storage/guest-storage";
import { InMemoryGuestStorage } from "../storage/in-memory-guest-storage";
import {
  guestDeleteSession,
  guestDeleteSet,
  guestDiscardSession,
  guestEditSet,
  guestFinishSession,
  guestLogSet,
  guestStartSession,
  loadGuestActiveSession,
  loadGuestFinishView,
  loadGuestHistory,
  loadGuestSessionDetail,
  type GuestSessionDeps,
} from "./guest-session-forms";

const emptySetState = { errors: {}, values: null };
const emptyFinishState = { errors: {}, values: { notes: "" } };
const item = (exerciseId: number, targetSets = 1) => ({
  exerciseId,
  targetSets,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  notes: null,
});

function form(fields: Record<string, string | number>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, String(value));
  return data;
}

let storage: InMemoryGuestStorage;
let deps: GuestSessionDeps;
let squat: number;
let lunge: number;
let routineId: number;

beforeEach(async () => {
  storage = new InMemoryGuestStorage();
  const exercises = new BrowserExerciseRepository(storage);
  squat = (await exercises.create(GUEST_USER_ID, { name: "Squat", muscleGroup: "legs", notes: null })).id;
  lunge = (await exercises.create(GUEST_USER_ID, { name: "Lunge", muscleGroup: "legs", notes: null })).id;
  const routines = new BrowserRoutineRepository(storage);
  routineId = (await routines.create(GUEST_USER_ID, { name: "Legs", description: null, items: [item(squat)] })).id;
  deps = {
    sessions: new BrowserSessionRepository(storage),
    routines,
    exercises,
    uow: new BrowserSessionUnitOfWork(storage),
  };
});

async function started(fromRoutine: number | null = null) {
  const onStarted = vi.fn<() => void>();
  await guestStartSession(deps, onStarted)({}, form({ routineId: fromRoutine ?? "" }));
  const session = await deps.sessions.findActive(GUEST_USER_ID);
  if (!session) throw new Error("setup failed");
  return session.id;
}

async function logged(sessionId: number, exerciseId = squat, weightKg = "80", reps = "8") {
  const state = await guestLogSet(deps)(
    emptySetState,
    form({ sessionId, exerciseId, weightKg, reps, rpe: "", restSeconds: "" }),
  );
  expect(state).toEqual(emptySetState);
  const sets = (await deps.sessions.findById(GUEST_USER_ID, sessionId))!.sets;
  return sets[sets.length - 1].id;
}

async function finished(sessionId: number, fields: Record<string, string> = {}) {
  const onFinished = vi.fn<(id: number) => void>();
  const state = await guestFinishSession(deps, onFinished)(emptyFinishState, form({ sessionId, notes: "", ...fields }));
  return { state, onFinished };
}

describe("guestStartSession", () => {
  it("starts a free workout or one from a routine, then calls back", async () => {
    const onStarted = vi.fn<() => void>();
    expect(await guestStartSession(deps, onStarted)({}, form({ routineId: routineId }))).toEqual({});
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(await deps.sessions.findActive(GUEST_USER_ID)).toMatchObject({ routineId });
  });

  it("allows one active workout and points to it", async () => {
    const active = await started();
    const onStarted = vi.fn<() => void>();

    expect(await guestStartSession(deps, onStarted)({}, form({ routineId: "" }))).toEqual({
      error: "Finish or discard your current workout first.",
      activeSessionId: active,
    });
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("refuses a routine that cannot be started", async () => {
    await deps.routines.setArchived(GUEST_USER_ID, routineId, true);
    const onStarted = vi.fn<() => void>();
    for (const value of [routineId, "abc", 999]) {
      expect(await guestStartSession(deps, onStarted)({}, form({ routineId: value }))).toEqual({
        error: "This routine can't be started.",
      });
    }
    expect(onStarted).not.toHaveBeenCalled();
    expect(await deps.sessions.findActive(GUEST_USER_ID)).toBeNull();
  });

  it("shows a storage failure instead of failing silently", async () => {
    storage.failWritesWith("quota_exceeded");
    expect((await guestStartSession(deps, vi.fn<() => void>())({}, form({ routineId: "" }))).error).toMatch(/full/);
  });
});

describe("guestLogSet / guestEditSet / guestDeleteSet", () => {
  it("logs, edits and deletes sets through the session rules", async () => {
    const sessionId = await started();
    const first = await logged(sessionId);
    await logged(sessionId);

    expect(
      await guestEditSet(deps)(emptySetState, form({ sessionId, setId: first, weightKg: "85", reps: "6", rpe: "9", restSeconds: "" })),
    ).toEqual(emptySetState);
    expect(await guestDeleteSet(deps)({}, form({ sessionId, setId: first }))).toEqual({});

    expect((await deps.sessions.findById(GUEST_USER_ID, sessionId))!.sets).toMatchObject([
      { exerciseId: squat, setNumber: 1, weightKg: 80 },
    ]);
  });

  it("returns validation errors with the submitted values", async () => {
    const sessionId = await started();
    const values = { exerciseId: String(squat), weightKg: "80.123", reps: "0", rpe: "", restSeconds: "" };

    expect(await guestLogSet(deps)(emptySetState, form({ sessionId, ...values }))).toEqual({
      errors: {
        weightKg: "Weight must be a number from 0 to 999.99 kg with at most 2 decimals.",
        reps: "Reps must be a whole number from 1 to 100.",
      },
      values,
    });
  });

  it("refuses an exercise the guest does not have, and a workout that is not active", async () => {
    const sessionId = await started();
    const values = { weightKg: "80", reps: "8", rpe: "", restSeconds: "" };

    expect((await guestLogSet(deps)(emptySetState, form({ sessionId, exerciseId: 999, ...values }))).errors).toEqual({
      exerciseId: "Choose one of your exercises.",
    });
    expect((await guestLogSet(deps)(emptySetState, form({ sessionId: 999, exerciseId: squat, ...values }))).errors).toEqual({
      form: "This workout is no longer active.",
    });
    expect((await guestEditSet(deps)(emptySetState, form({ sessionId, setId: 999, ...values }))).errors).toEqual({
      form: "This set no longer exists.",
    });
    expect(await guestDeleteSet(deps)({}, form({ sessionId, setId: 999 }))).toEqual({ error: "This set no longer exists." });
  });

  it("keeps the last set of a finished workout and edits sets after finishing", async () => {
    const sessionId = await started();
    const setId = await logged(sessionId);
    await finished(sessionId);

    expect(await guestDeleteSet(deps)({}, form({ sessionId, setId }))).toEqual({ error: "Delete the whole workout instead." });
    expect(
      await guestEditSet(deps)(emptySetState, form({ sessionId, setId, weightKg: "90", reps: "5", rpe: "", restSeconds: "" })),
    ).toEqual(emptySetState);
    expect((await deps.sessions.findById(GUEST_USER_ID, sessionId))!.sets).toMatchObject([{ weightKg: 90, reps: 5 }]);
  });

  it("shows a storage failure on the form", async () => {
    const sessionId = await started();
    storage.failWritesWith("quota_exceeded");
    const state = await guestLogSet(deps)(
      emptySetState,
      form({ sessionId, exerciseId: squat, weightKg: "80", reps: "8", rpe: "", restSeconds: "" }),
    );
    expect(state.errors.form).toMatch(/full/);
    expect(state.values).toMatchObject({ weightKg: "80" });
  });
});

describe("guestFinishSession", () => {
  it("saves the workout without touching the routine", async () => {
    const sessionId = await started(routineId);
    await logged(sessionId, lunge);
    const before = await deps.routines.findById(GUEST_USER_ID, routineId);

    const { onFinished } = await finished(sessionId, { notes: "Good" });

    expect(onFinished).toHaveBeenCalledWith(sessionId);
    expect(await deps.sessions.findById(GUEST_USER_ID, sessionId)).toMatchObject({ notes: "Good", finishedAt: expect.any(Date) });
    expect(await deps.routines.findById(GUEST_USER_ID, routineId)).toEqual(before);
  });

  it("saves the workout and updates the routine with its additions", async () => {
    const sessionId = await started(routineId);
    await logged(sessionId, lunge);

    const { onFinished } = await finished(sessionId, { updateRoutine: "yes" });

    expect(onFinished).toHaveBeenCalledWith(sessionId);
    expect((await deps.routines.findById(GUEST_USER_ID, routineId))!.items.map((i) => i.exerciseId)).toEqual([squat, lunge]);
  });

  it("finishes nothing and changes nothing when the routine would exceed 50 exercises", async () => {
    await deps.routines.update(GUEST_USER_ID, routineId, {
      name: "Legs",
      description: null,
      items: Array.from({ length: 50 }, () => item(squat, 5)),
    });
    const routine = await deps.routines.findById(GUEST_USER_ID, routineId);
    const sessionId = await started(routineId);
    await logged(sessionId, lunge);

    const { state, onFinished } = await finished(sessionId, { updateRoutine: "yes", notes: "Kept" });

    expect(state).toEqual({
      errors: { routine: "The routine could not be updated: A routine can have at most 50 exercises." },
      values: { notes: "Kept" },
    });
    expect(onFinished).not.toHaveBeenCalled();
    expect(await deps.sessions.findActive(GUEST_USER_ID)).toMatchObject({ id: sessionId, finishedAt: null });
    expect(await deps.routines.findById(GUEST_USER_ID, routineId)).toEqual(routine);
  });

  it("names the guest's exercise when one routine item breaks the rules", async () => {
    const sessionId = await started(routineId);
    for (let i = 0; i < 21; i++) await logged(sessionId, squat);

    const { state } = await finished(sessionId, { updateRoutine: "yes" });

    expect(state.errors.routine).toBe(
      "The routine could not be updated (Squat): Sets must be a whole number from 1 to 20.",
    );
  });

  it("needs a set and a workout that is still active", async () => {
    const sessionId = await started();
    expect((await finished(sessionId)).state.errors).toEqual({ sets: "Log at least one set before finishing." });
    expect((await finished(999)).state.errors).toEqual({ form: "This workout is no longer active." });
  });

  it("shows a storage failure and keeps the workout active", async () => {
    const sessionId = await started();
    await logged(sessionId);
    storage.failWritesWith("quota_exceeded");

    const { state, onFinished } = await finished(sessionId);

    expect(state.errors.form).toMatch(/full/);
    expect(onFinished).not.toHaveBeenCalled();
    storage.failWritesWith(null);
    expect(await deps.sessions.findActive(GUEST_USER_ID)).toMatchObject({ id: sessionId });
  });
});

describe("guestDiscardSession / guestDeleteSession", () => {
  it("discards the active workout only", async () => {
    const sessionId = await started();
    await logged(sessionId);
    const onDone = vi.fn<() => void>();
    const onError = vi.fn<(message: string) => void>();

    await guestDeleteSession(deps, onDone, onError)(form({ sessionId }));
    expect(await deps.sessions.findActive(GUEST_USER_ID)).not.toBeNull();

    await guestDiscardSession(deps, onDone, onError)(form({ sessionId }));
    expect(await deps.sessions.findById(GUEST_USER_ID, sessionId)).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it("deletes a finished workout only", async () => {
    const sessionId = await started();
    await logged(sessionId);
    await finished(sessionId);
    const onDone = vi.fn<() => void>();
    const onError = vi.fn<(message: string) => void>();

    await guestDiscardSession(deps, onDone, onError)(form({ sessionId }));
    expect(await deps.sessions.findById(GUEST_USER_ID, sessionId)).not.toBeNull();

    await guestDeleteSession(deps, onDone, onError)(form({ sessionId }));
    expect(await deps.sessions.findById(GUEST_USER_ID, sessionId)).toBeNull();
  });

  it("reports a storage failure instead of moving on", async () => {
    const sessionId = await started();
    storage.failWritesWith("unavailable");
    const onDone = vi.fn<() => void>();
    const onError = vi.fn<(message: string) => void>();

    await guestDiscardSession(deps, onDone, onError)(form({ sessionId }));

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/private window/));
  });
});

describe("guest workout reads", () => {
  it("prefills from the guest's own last finished workout, with no trainer suggestion", async () => {
    const earlier = await started();
    await logged(earlier, squat, "100", "5");
    await finished(earlier);
    const sessionId = await started(routineId);

    const view = await loadGuestActiveSession(deps);

    expect(view).toMatchObject({ id: sessionId, title: "Legs" });
    expect(view!.cards).toMatchObject([
      { exerciseId: squat, prefill: { weightKg: "100", reps: "5", restSeconds: "90" }, lastTime: "Last time: 100 kg × 5", suggestion: null },
    ]);
    expect(view!.addable.map((e) => e.name)).toEqual(["Lunge"]);
  });

  it("has no active workout view when none is active", async () => {
    expect(await loadGuestActiveSession(deps)).toBeNull();
    expect(await loadGuestFinishView(deps)).toBeNull();
  });

  it("lists what finishing would add to the routine", async () => {
    const sessionId = await started(routineId);
    await logged(sessionId, lunge);

    expect(await loadGuestFinishView(deps)).toEqual({
      id: sessionId,
      setCount: 1,
      routineName: "Legs",
      changes: [expect.stringContaining("Lunge")],
    });
  });

  it("lists finished workouts and shows one; an active one is not a detail", async () => {
    const sessionId = await started(routineId);
    await logged(sessionId, squat);
    expect(await loadGuestSessionDetail(deps, sessionId)).toBeNull();
    await finished(sessionId, { notes: "Done" });

    expect(await loadGuestHistory(deps)).toMatchObject([{ id: sessionId, title: "Legs", exerciseCount: 1, setCount: 1 }]);
    expect(await loadGuestSessionDetail(deps, sessionId)).toMatchObject({
      id: sessionId,
      title: "Legs",
      notes: "Done",
      setCount: 1,
      groups: [{ exerciseId: squat, name: "Squat" }],
    });
    expect(await loadGuestSessionDetail(deps, 999)).toBeNull();
  });
});
