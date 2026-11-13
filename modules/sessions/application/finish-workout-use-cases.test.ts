import { beforeEach, describe, expect, it } from "vitest";
import type { RoutineItem } from "@/modules/routines/domain/routine";
import { InMemoryRoutineRepository } from "@/modules/routines/testing/in-memory-routine-repository";
import type { RawSetInput } from "../domain/session";
import { InMemorySessionRepository } from "../testing/in-memory-session-repository";
import { InMemoryUnitOfWork } from "../testing/in-memory-unit-of-work";
import { finishWorkout, previewRoutineUpdate } from "./finish-workout-use-cases";
import { getActiveSession, getSession, logSet, startSession } from "./session-use-cases";

const ALICE = 1;
const BOB = 2;
const BENCH = 10;
const DIPS = 11;
const BOBS_ROW = 20;

const raw = (overrides: RawSetInput = {}): RawSetInput => ({ weightKg: "80", reps: "8", rpe: "", restSeconds: "", ...overrides });
const item = (exerciseId: number, overrides: Partial<RoutineItem> = {}): RoutineItem => ({
  exerciseId,
  targetSets: 1,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 120,
  notes: null,
  ...overrides,
});

let sessions: InMemorySessionRepository;
let routines: InMemoryRoutineRepository;
let uow: InMemoryUnitOfWork;

beforeEach(() => {
  sessions = new InMemorySessionRepository();
  routines = new InMemoryRoutineRepository();
  for (const [userId, exerciseId] of [
    [ALICE, BENCH],
    [ALICE, DIPS],
    [BOB, BOBS_ROW],
  ]) {
    sessions.addExercise(userId, exerciseId);
    routines.addExercise(userId, exerciseId);
  }
  uow = new InMemoryUnitOfWork(sessions, routines);
});

async function routineOf(userId: number, items: RoutineItem[], { archived = false } = {}) {
  const routine = await routines.create(userId, { name: "Push day", description: null, items });
  if (archived) await routines.setArchived(userId, routine.id, true);
  // The session repository only knows routine ids; register this one as Alice's.
  sessions.addRoutine(ALICE, routine.id);
  return routine;
}

/** Starts a session for Alice and logs the given sets (exercise, reps, rest). */
async function sessionWith(routineId: number | null, sets: Array<[number, string?, string?]>) {
  const started = await startSession(sessions, ALICE, routineId);
  if (!started.ok) throw new Error("setup failed");
  for (const [exerciseId, reps = "8", restSeconds = ""] of sets) {
    const logged = await logSet(sessions, ALICE, started.session.id, exerciseId, raw({ reps, restSeconds }));
    if (!logged.ok) throw new Error("setup failed");
  }
  return started.session;
}

describe("previewRoutineUpdate", () => {
  it("lists the additions the session would make to its routine", async () => {
    const routine = await routineOf(ALICE, [item(BENCH)]);
    const session = await sessionWith(routine.id, [[BENCH], [BENCH], [DIPS, "10", "60"], [DIPS, "8"]]);

    expect(await previewRoutineUpdate({ sessions, routines }, ALICE, session.id)).toEqual({
      routineId: routine.id,
      changes: [
        { type: "raise_sets", exerciseId: BENCH, from: 1, to: 2 },
        { type: "add_exercise", exerciseId: DIPS, targetSets: 2, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 60 },
      ],
    });
  });

  it("has no changes when the session only did what the routine asks", async () => {
    const routine = await routineOf(ALICE, [item(BENCH, { targetSets: 2 })]);
    const session = await sessionWith(routine.id, [[BENCH]]);

    expect(await previewRoutineUpdate({ sessions, routines }, ALICE, session.id)).toBeNull();
  });

  it("has no changes for a free session", async () => {
    const session = await sessionWith(null, [[BENCH], [DIPS]]);

    expect(await previewRoutineUpdate({ sessions, routines }, ALICE, session.id)).toBeNull();
  });

  it("has no changes when the routine was archived or is not the user's", async () => {
    const routine = await routineOf(ALICE, [item(BENCH)]);
    const session = await sessionWith(routine.id, [[DIPS]]);
    await routines.setArchived(ALICE, routine.id, true);

    expect(await previewRoutineUpdate({ sessions, routines }, ALICE, session.id)).toBeNull();

    await sessions.discard(ALICE, session.id);
    const bobs = await routineOf(BOB, [item(BOBS_ROW)]);
    const fromBobs = await sessionWith(bobs.id, [[DIPS]]);
    expect(await previewRoutineUpdate({ sessions, routines }, ALICE, fromBobs.id)).toBeNull();
  });

  it("has no changes for a missing, another user's, or finished session", async () => {
    const routine = await routineOf(ALICE, [item(BENCH)]);
    const session = await sessionWith(routine.id, [[DIPS]]);

    expect(await previewRoutineUpdate({ sessions, routines }, BOB, session.id)).toBeNull();
    expect(await previewRoutineUpdate({ sessions, routines }, ALICE, 999)).toBeNull();
    await finishWorkout(uow, ALICE, session.id, "", { updateRoutine: false });
    expect(await previewRoutineUpdate({ sessions, routines }, ALICE, session.id)).toBeNull();
  });
});

describe("finishWorkout", () => {
  it("only saves the session when the routine update is not wanted", async () => {
    const routine = await routineOf(ALICE, [item(BENCH)]);
    const session = await sessionWith(routine.id, [[BENCH], [DIPS]]);

    const result = await finishWorkout(uow, ALICE, session.id, " Good ", { updateRoutine: false });

    expect(result).toMatchObject({ ok: true, session: { id: session.id, finishedAt: expect.any(Date), notes: "Good" } });
    expect(await routines.findById(ALICE, routine.id)).toEqual(routine);
  });

  it("saves the session and applies the additions to the routine", async () => {
    const routine = await routineOf(ALICE, [item(BENCH, { notes: "Pause" })]);
    const session = await sessionWith(routine.id, [[BENCH], [BENCH, "6"], [DIPS, "10"], [DIPS, "12", "45"]]);

    const result = await finishWorkout(uow, ALICE, session.id, "", { updateRoutine: true });

    expect(result).toMatchObject({ ok: true, session: { id: session.id, finishedAt: expect.any(Date) } });
    expect((await routines.findById(ALICE, routine.id))?.items).toEqual([
      item(BENCH, { notes: "Pause", targetSets: 2 }),
      { exerciseId: DIPS, targetSets: 2, targetRepsMin: 10, targetRepsMax: 12, restSeconds: 45, notes: null },
    ]);
  });

  it("just saves when there is nothing to add, the session is free, or the routine is archived", async () => {
    const routine = await routineOf(ALICE, [item(BENCH, { targetSets: 3 })]);
    const matching = await sessionWith(routine.id, [[BENCH]]);
    expect(await finishWorkout(uow, ALICE, matching.id, "", { updateRoutine: true })).toMatchObject({ ok: true });

    const free = await sessionWith(null, [[DIPS]]);
    expect(await finishWorkout(uow, ALICE, free.id, "", { updateRoutine: true })).toMatchObject({ ok: true });

    const fromArchived = await sessionWith(routine.id, [[DIPS]]);
    await routines.setArchived(ALICE, routine.id, true);
    expect(await finishWorkout(uow, ALICE, fromArchived.id, "", { updateRoutine: true })).toMatchObject({ ok: true });

    expect((await routines.findById(ALICE, routine.id))?.items).toEqual(routine.items);
  });

  it("finishes nothing and changes nothing when the routine would exceed 50 exercises", async () => {
    const routine = await routineOf(ALICE, Array.from({ length: 50 }, () => item(BENCH, { targetSets: 5 })));
    const session = await sessionWith(routine.id, [[DIPS]]);

    expect(await finishWorkout(uow, ALICE, session.id, "", { updateRoutine: true })).toEqual({
      ok: false,
      reason: "invalid",
      errors: { routine: "The routine could not be updated: A routine can have at most 50 exercises." },
    });
    expect(await getActiveSession(sessions, ALICE)).toMatchObject({ id: session.id, finishedAt: null });
    expect(await routines.findById(ALICE, routine.id)).toEqual(routine);
  });

  it("reports an item that breaks the routine rules, such as more than 20 sets", async () => {
    const routine = await routineOf(ALICE, [item(BENCH)]);
    const session = await sessionWith(
      routine.id,
      Array.from({ length: 21 }, (): [number] => [BENCH]),
    );

    expect(await finishWorkout(uow, ALICE, session.id, "", { updateRoutine: true })).toEqual({
      ok: false,
      reason: "invalid",
      errors: { routine: "The routine could not be updated: Sets must be a whole number from 1 to 20." },
    });
    expect((await getSession(sessions, ALICE, session.id))?.finishedAt).toBeNull();
    expect(await routines.findById(ALICE, routine.id)).toEqual(routine);
  });

  it("keeps the existing finish errors and leaves the routine alone", async () => {
    const routine = await routineOf(ALICE, [item(BENCH)]);
    const empty = await sessionWith(routine.id, []);

    expect(await finishWorkout(uow, ALICE, empty.id, "", { updateRoutine: true })).toEqual({
      ok: false,
      reason: "invalid",
      errors: { sets: "Log at least one set before finishing." },
    });
    await logSet(sessions, ALICE, empty.id, DIPS, raw());
    expect(await finishWorkout(uow, ALICE, empty.id, "a".repeat(1001), { updateRoutine: true })).toEqual({
      ok: false,
      reason: "invalid",
      errors: { notes: "Notes must be at most 1000 characters." },
    });
    expect(await finishWorkout(uow, BOB, empty.id, "", { updateRoutine: true })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await routines.findById(ALICE, routine.id)).toEqual(routine);
    expect(await getActiveSession(sessions, ALICE)).toMatchObject({ id: empty.id });
  });
});
