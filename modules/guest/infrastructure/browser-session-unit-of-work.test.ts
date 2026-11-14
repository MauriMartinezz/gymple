import { beforeEach, describe, expect, it, vi } from "vitest";
import { finishWorkout } from "@/modules/sessions/application/finish-workout-use-cases";
import { GuestStorageError } from "../storage/guest-storage";
import { InMemoryGuestStorage } from "../storage/in-memory-guest-storage";
import { BrowserExerciseRepository } from "./browser-exercise-repository";
import { BrowserRoutineRepository } from "./browser-routine-repository";
import { BrowserSessionRepository } from "./browser-session-repository";
import { BrowserSessionUnitOfWork } from "./browser-session-unit-of-work";

const set = { weightKg: 80, reps: 8, rpe: null, restSeconds: null };
const item = (exerciseId: number, targetSets = 3) => ({
  exerciseId,
  targetSets,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  notes: null,
});

let storage: InMemoryGuestStorage;
let sessions: BrowserSessionRepository;
let routines: BrowserRoutineRepository;
let uow: BrowserSessionUnitOfWork;
let squat: number;
let lunge: number;

beforeEach(async () => {
  storage = new InMemoryGuestStorage();
  const exercises = new BrowserExerciseRepository(storage);
  squat = (await exercises.create(1, { name: "Squat", muscleGroup: "legs", notes: null })).id;
  lunge = (await exercises.create(1, { name: "Lunge", muscleGroup: "legs", notes: null })).id;
  sessions = new BrowserSessionRepository(storage);
  routines = new BrowserRoutineRepository(storage);
  uow = new BrowserSessionUnitOfWork(storage);
});

describe("BrowserSessionUnitOfWork", () => {
  it("keeps both repositories' writes when the work succeeds, in one storage write", async () => {
    const write = vi.spyOn(storage, "write");

    const result = await uow.run(async (repos) => {
      const routine = await repos.routines.create(1, { name: "Legs", description: null, items: [item(squat)] });
      const session = await repos.sessions.start(1, null);
      return { routine, session };
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(await routines.findById(1, result.routine.id)).toEqual(result.routine);
    expect(await sessions.findActive(1)).toEqual(result.session);
  });

  it("lets the work read its own writes before they are saved", async () => {
    await uow.run(async (repos) => {
      const session = await repos.sessions.start(1, null);
      await repos.sessions.addSet(1, session.id, squat, set);
      expect((await repos.sessions.findActive(1))?.sets).toHaveLength(1);
      expect(await sessions.findActive(1)).toBeNull();
    });
  });

  it("restores both repositories when the work throws, and writes nothing", async () => {
    const routine = await routines.create(1, { name: "Legs", description: null, items: [item(squat)] });
    const session = await sessions.start(1, null);
    await sessions.addSet(1, session.id, squat, set);
    const before = storage.rawText();
    const write = vi.spyOn(storage, "write");

    await expect(
      uow.run(async (repos) => {
        await repos.sessions.finish(1, session.id, "done");
        await repos.routines.update(1, routine.id, { name: "Renamed", description: null, items: [item(squat), item(lunge)] });
        await repos.routines.create(1, { name: "Extra", description: null, items: [item(squat)] });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(write).not.toHaveBeenCalled();
    expect(storage.rawText()).toBe(before);
    expect(await routines.list(1, { archived: false })).toEqual([routine]);
    // Id counters are restored too, so later writes behave as if nothing happened.
    expect((await routines.create(1, { name: "Next", description: null, items: [item(squat)] })).id).toBe(routine.id + 1);
  });

  it("changes nothing when the final save fails", async () => {
    const session = await sessions.start(1, null);
    await sessions.addSet(1, session.id, squat, set);
    const before = storage.rawText();
    storage.failWritesWith("quota_exceeded");

    await expect(uow.run((repos) => repos.sessions.finish(1, session.id, null))).rejects.toBeInstanceOf(GuestStorageError);

    storage.failWritesWith(null);
    expect(storage.rawText()).toBe(before);
    expect(await sessions.findActive(1)).toMatchObject({ id: session.id, finishedAt: null });
  });

  it("does not write when the work only reads", async () => {
    const write = vi.spyOn(storage, "write");
    await uow.run((repos) => repos.sessions.listFinished(1));
    expect(write).not.toHaveBeenCalled();
  });

  it("reports unreadable storage before running the work", async () => {
    storage.failReadsWith("corrupted");
    const work = vi.fn<() => Promise<void>>();
    await expect(uow.run(work)).rejects.toMatchObject({ reason: "corrupted" });
    expect(work).not.toHaveBeenCalled();
  });
});

describe("finishWorkout with the browser unit of work", () => {
  it("finishes the workout and updates the routine together", async () => {
    const routine = await routines.create(1, { name: "Legs", description: null, items: [item(squat, 1)] });
    const session = await sessions.start(1, routine.id);
    await sessions.addSet(1, session.id, squat, set);
    await sessions.addSet(1, session.id, lunge, set);

    expect(await finishWorkout(uow, 1, session.id, "", { updateRoutine: true })).toMatchObject({ ok: true });

    expect(await sessions.findActive(1)).toBeNull();
    expect((await routines.findById(1, routine.id))?.items.map((i) => i.exerciseId)).toEqual([squat, lunge]);
  });

  it("leaves the workout active and the routine unchanged when the routine would exceed 50 exercises", async () => {
    const routine = await routines.create(1, {
      name: "Legs",
      description: null,
      items: Array.from({ length: 50 }, () => item(squat, 5)),
    });
    const session = await sessions.start(1, routine.id);
    await sessions.addSet(1, session.id, lunge, set);
    const before = storage.rawText();

    expect(await finishWorkout(uow, 1, session.id, "", { updateRoutine: true })).toEqual({
      ok: false,
      reason: "invalid",
      errors: { routine: "The routine could not be updated: A routine can have at most 50 exercises." },
    });
    expect(storage.rawText()).toBe(before);
    expect(await sessions.findActive(1)).toMatchObject({ id: session.id, finishedAt: null });
    expect(await routines.findById(1, routine.id)).toEqual(routine);
  });
});
