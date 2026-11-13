import { beforeEach, describe, expect, it } from "vitest";
import type { RawSetInput } from "../domain/session";
import { InMemorySessionRepository } from "../testing/in-memory-session-repository";
import {
  deleteFinishedSession,
  deleteSet,
  discardSession,
  editSet,
  finishSession,
  getActiveSession,
  getLastPerformance,
  getSession,
  listHistory,
  logSet,
  startSession,
} from "./session-use-cases";

const ALICE = 1;
const BOB = 2;
const SQUAT = 10;
const OLD_LUNGE = 11; // archived
const BOBS_DEADLIFT = 20;
const LEG_DAY = 100;
const OLD_ROUTINE = 101; // archived
const BOBS_ROUTINE = 200;

const raw = (overrides: RawSetInput = {}): RawSetInput => ({ weightKg: "80", reps: "8", rpe: "", restSeconds: "", ...overrides });

let repo: InMemorySessionRepository;

beforeEach(() => {
  repo = new InMemorySessionRepository();
  repo.addExercise(ALICE, SQUAT);
  repo.addExercise(ALICE, OLD_LUNGE, { archived: true });
  repo.addExercise(BOB, BOBS_DEADLIFT);
  repo.addRoutine(ALICE, LEG_DAY);
  repo.addRoutine(ALICE, OLD_ROUTINE, { archived: true });
  repo.addRoutine(BOB, BOBS_ROUTINE);
});

async function startOrFail(userId: number, routineId: number | null = null) {
  const result = await startSession(repo, userId, routineId);
  if (!result.ok) throw new Error("setup failed");
  return result.session;
}

async function finishedWorkout(userId: number, exerciseId: number, overrides: RawSetInput = {}) {
  const session = await startOrFail(userId);
  await logSet(repo, userId, session.id, exerciseId, raw(overrides));
  const result = await finishSession(repo, userId, session.id, "");
  if (!result.ok) throw new Error("setup failed");
  return result.session;
}

describe("startSession", () => {
  it("starts a free session or one from the user's routine", async () => {
    const free = await startSession(repo, ALICE, null);
    expect(free).toEqual({
      ok: true,
      session: { id: expect.any(Number), routineId: null, startedAt: expect.any(Date), finishedAt: null, notes: null, sets: [] },
    });

    if (free.ok) await discardSession(repo, ALICE, free.session.id);
    expect(await startSession(repo, ALICE, LEG_DAY)).toMatchObject({ ok: true, session: { routineId: LEG_DAY } });
  });

  it("rejects a second session and points to the active one", async () => {
    const active = await startOrFail(ALICE);

    expect(await startSession(repo, ALICE, LEG_DAY)).toEqual({
      ok: false,
      reason: "active_exists",
      error: "Finish or discard your current workout first.",
      activeSessionId: active.id,
    });
  });

  it.each([
    ["an archived", OLD_ROUTINE],
    ["another user's", BOBS_ROUTINE],
    ["a missing", 999],
  ])("treats %s routine as not found and starts nothing", async (_, routineId) => {
    expect(await startSession(repo, ALICE, routineId)).toEqual({ ok: false, reason: "not_found" });
    expect(await getActiveSession(repo, ALICE)).toBeNull();
  });
});

describe("logSet", () => {
  it("validates and logs a set, numbering it per exercise", async () => {
    const session = await startOrFail(ALICE);

    await logSet(repo, ALICE, session.id, SQUAT, raw());
    const result = await logSet(repo, ALICE, session.id, SQUAT, raw({ weightKg: "82.5", reps: "6", rpe: "8.5", restSeconds: "120" }));

    expect(result).toEqual({
      ok: true,
      set: {
        id: expect.any(Number),
        exerciseId: SQUAT,
        setNumber: 2,
        weightKg: 82.5,
        reps: 6,
        rpe: 8.5,
        restSeconds: 120,
        completedAt: expect.any(Date),
      },
    });
  });

  it("returns field errors and logs nothing when the input is invalid", async () => {
    const session = await startOrFail(ALICE);

    expect(await logSet(repo, ALICE, session.id, SQUAT, raw({ weightKg: "1e3", reps: "0" }))).toEqual({
      ok: false,
      reason: "invalid",
      errors: {
        weightKg: "Weight must be a number from 0 to 999.99 kg with at most 2 decimals.",
        reps: "Reps must be a whole number from 1 to 100.",
      },
    });
    expect((await getActiveSession(repo, ALICE))?.sets).toEqual([]);
  });

  it.each([
    ["another user's", BOBS_DEADLIFT],
    ["a missing", 999],
    ["an archived", OLD_LUNGE],
  ])("rejects %s exercise and logs nothing", async (_, exerciseId) => {
    const session = await startOrFail(ALICE);

    expect(await logSet(repo, ALICE, session.id, exerciseId, raw())).toEqual({
      ok: false,
      reason: "invalid",
      errors: { exerciseId: "Choose one of your exercises." },
    });
    expect((await getActiveSession(repo, ALICE))?.sets).toEqual([]);
  });

  it("treats another user's, a missing or a finished session as not found", async () => {
    const bobs = await startOrFail(BOB);
    const finished = await finishedWorkout(ALICE, SQUAT);

    expect(await logSet(repo, ALICE, bobs.id, SQUAT, raw())).toEqual({ ok: false, reason: "not_found" });
    expect(await logSet(repo, ALICE, 999, SQUAT, raw())).toEqual({ ok: false, reason: "not_found" });
    expect(await logSet(repo, ALICE, finished.id, SQUAT, raw())).toEqual({ ok: false, reason: "not_found" });
    expect((await getSession(repo, BOB, bobs.id))?.sets).toEqual([]);
  });
});

describe("editSet and deleteSet", () => {
  it("edits a set with validated values", async () => {
    const session = await startOrFail(ALICE);
    const logged = await logSet(repo, ALICE, session.id, SQUAT, raw());
    if (!logged.ok) throw new Error("setup failed");

    expect(await editSet(repo, ALICE, session.id, logged.set.id, raw({ weightKg: "85", rpe: "9" }))).toEqual({
      ok: true,
      set: { ...logged.set, weightKg: 85, rpe: 9 },
    });
  });

  it("returns field errors and changes nothing for invalid values", async () => {
    const session = await startOrFail(ALICE);
    const logged = await logSet(repo, ALICE, session.id, SQUAT, raw());
    if (!logged.ok) throw new Error("setup failed");

    expect(await editSet(repo, ALICE, session.id, logged.set.id, raw({ rpe: "7.3" }))).toEqual({
      ok: false,
      reason: "invalid",
      errors: { rpe: "RPE must be a number from 1 to 10 in steps of 0.5." },
    });
    expect((await getSession(repo, ALICE, session.id))?.sets).toEqual([logged.set]);
  });

  it("cannot edit or delete another user's set", async () => {
    const bobs = await startOrFail(BOB);
    const logged = await logSet(repo, BOB, bobs.id, BOBS_DEADLIFT, raw());
    if (!logged.ok) throw new Error("setup failed");

    expect(await editSet(repo, ALICE, bobs.id, logged.set.id, raw({ reps: "1" }))).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteSet(repo, ALICE, bobs.id, logged.set.id)).toEqual({ ok: false, reason: "not_found" });
    expect((await getSession(repo, BOB, bobs.id))?.sets).toEqual([logged.set]);
  });

  it("deletes the user's set", async () => {
    const session = await startOrFail(ALICE);
    const logged = await logSet(repo, ALICE, session.id, SQUAT, raw());
    if (!logged.ok) throw new Error("setup failed");

    expect(await deleteSet(repo, ALICE, session.id, logged.set.id)).toEqual({ ok: true });
    expect((await getSession(repo, ALICE, session.id))?.sets).toEqual([]);
  });

  it("deletes a set of a finished session that has others", async () => {
    const session = await startOrFail(ALICE);
    await logSet(repo, ALICE, session.id, SQUAT, raw());
    const second = await logSet(repo, ALICE, session.id, SQUAT, raw({ reps: "6" }));
    if (!second.ok) throw new Error("setup failed");
    await finishSession(repo, ALICE, session.id, "");

    expect(await deleteSet(repo, ALICE, session.id, second.set.id)).toEqual({ ok: true });
    expect((await getSession(repo, ALICE, session.id))?.sets).toHaveLength(1);
  });

  it("refuses to delete the last set of a finished session", async () => {
    const finished = await finishedWorkout(ALICE, SQUAT);

    expect(await deleteSet(repo, ALICE, finished.id, finished.sets[0].id)).toEqual({
      ok: false,
      reason: "last_set",
      error: "Delete the whole workout instead.",
    });
    expect(await getSession(repo, ALICE, finished.id)).toEqual(finished);
  });
});

describe("finishSession", () => {
  it("finishes the session with normalized notes", async () => {
    const session = await startOrFail(ALICE);
    await logSet(repo, ALICE, session.id, SQUAT, raw());

    const result = await finishSession(repo, ALICE, session.id, "  Felt\r\nstrong ");

    expect(result).toMatchObject({ ok: true, session: { id: session.id, finishedAt: expect.any(Date), notes: "Felt\nstrong" } });
    expect(await getActiveSession(repo, ALICE)).toBeNull();
  });

  it("refuses to finish a session without sets", async () => {
    const session = await startOrFail(ALICE);

    expect(await finishSession(repo, ALICE, session.id, "")).toEqual({
      ok: false,
      reason: "invalid",
      errors: { sets: "Log at least one set before finishing." },
    });
    expect(await getActiveSession(repo, ALICE)).toMatchObject({ id: session.id, finishedAt: null });
  });

  it("rejects notes that are too long and keeps the session active", async () => {
    const session = await startOrFail(ALICE);
    await logSet(repo, ALICE, session.id, SQUAT, raw());

    expect(await finishSession(repo, ALICE, session.id, "a".repeat(1001))).toEqual({
      ok: false,
      reason: "invalid",
      errors: { notes: "Notes must be at most 1000 characters." },
    });
    expect(await getActiveSession(repo, ALICE)).toMatchObject({ id: session.id });
  });

  it("treats another user's or an already finished session as not found", async () => {
    const bobs = await startOrFail(BOB);
    await logSet(repo, BOB, bobs.id, BOBS_DEADLIFT, raw());
    const finished = await finishedWorkout(ALICE, SQUAT);

    expect(await finishSession(repo, ALICE, bobs.id, "")).toEqual({ ok: false, reason: "not_found" });
    expect(await finishSession(repo, ALICE, finished.id, "")).toEqual({ ok: false, reason: "not_found" });
    expect(await getActiveSession(repo, BOB)).toMatchObject({ id: bobs.id });
  });
});

describe("discardSession and deleteFinishedSession", () => {
  it("discards only the user's active session", async () => {
    const bobs = await startOrFail(BOB);
    const finished = await finishedWorkout(ALICE, SQUAT);
    const active = await startOrFail(ALICE);

    expect(await discardSession(repo, ALICE, bobs.id)).toBe(false);
    expect(await discardSession(repo, ALICE, finished.id)).toBe(false);
    expect(await discardSession(repo, ALICE, active.id)).toBe(true);
    expect(await getActiveSession(repo, ALICE)).toBeNull();
    expect(await getActiveSession(repo, BOB)).toMatchObject({ id: bobs.id });
  });

  it("deletes only the user's finished session", async () => {
    const bobs = await finishedWorkout(BOB, BOBS_DEADLIFT);
    const finished = await finishedWorkout(ALICE, SQUAT);
    const active = await startOrFail(ALICE);

    expect(await deleteFinishedSession(repo, ALICE, bobs.id)).toBe(false);
    expect(await deleteFinishedSession(repo, ALICE, active.id)).toBe(false);
    expect(await deleteFinishedSession(repo, ALICE, finished.id)).toBe(true);
    expect(await listHistory(repo, ALICE)).toEqual([]);
    expect(await listHistory(repo, BOB)).toEqual([bobs]);
  });
});

describe("queries", () => {
  it("lists the user's finished sessions newest first and gets one by id", async () => {
    const older = await finishedWorkout(ALICE, SQUAT);
    const newer = await finishedWorkout(ALICE, SQUAT);
    const bobs = await finishedWorkout(BOB, BOBS_DEADLIFT);

    expect(await listHistory(repo, ALICE)).toEqual([newer, older]);
    expect(await getSession(repo, ALICE, older.id)).toEqual(older);
    expect(await getSession(repo, ALICE, bobs.id)).toBeNull();
  });

  it("returns the last set from the most recent finished session for prefill", async () => {
    await finishedWorkout(ALICE, SQUAT, { weightKg: "75" });
    await finishedWorkout(ALICE, SQUAT, { weightKg: "80", reps: "8" });
    const active = await startOrFail(ALICE);
    await logSet(repo, ALICE, active.id, SQUAT, raw({ weightKg: "100" }));

    expect(await getLastPerformance(repo, ALICE, SQUAT)).toMatchObject({ weightKg: 80, reps: 8 });
    expect(await getLastPerformance(repo, BOB, SQUAT)).toBeNull();
  });
});
