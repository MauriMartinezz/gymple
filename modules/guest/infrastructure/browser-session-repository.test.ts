import { describe, expect, it } from "vitest";
import { describeSessionRepositoryContract } from "@/modules/sessions/testing/session-repository-contract";
import { InMemoryGuestStorage } from "../storage/in-memory-guest-storage";
import { BrowserExerciseRepository } from "./browser-exercise-repository";
import { BrowserRoutineRepository } from "./browser-routine-repository";
import { BrowserSessionRepository } from "./browser-session-repository";

const item = (exerciseId: number) => ({
  exerciseId,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  notes: null,
});

/** Exercises and routines come from the same guest storage, through their own adapters. */
async function setup() {
  const storage = new InMemoryGuestStorage();
  const exercises = new BrowserExerciseRepository(storage);
  const routines = new BrowserRoutineRepository(storage);
  const create = (userId: number, name: string) =>
    exercises.create(userId, { name, muscleGroup: "legs", notes: null }).then((e) => e.id);

  const first = await create(1, "Squat");
  const second = await create(1, "Lunge");
  const archived = await create(1, "Curl");
  await exercises.setArchived(1, archived, true);
  const bobExercise = await create(2, "Row");

  const active = (await routines.create(1, { name: "Legs", description: null, items: [item(first)] })).id;
  const archivedRoutine = (await routines.create(1, { name: "Old", description: null, items: [item(first)] })).id;
  await routines.setArchived(1, archivedRoutine, true);
  const bobRoutine = (await routines.create(2, { name: "Back", description: null, items: [item(bobExercise)] })).id;

  return { storage, exercises, first, second, archived, bobExercise, active, archivedRoutine, bobRoutine };
}

describeSessionRepositoryContract("browser (guest storage)", async () => {
  const s = await setup();
  return {
    repo: new BrowserSessionRepository(s.storage),
    alice: 1,
    bob: 2,
    aliceExercises: { first: s.first, second: s.second, archived: s.archived },
    bobExercise: s.bobExercise,
    missingExercise: 999,
    aliceRoutines: { active: s.active, archived: s.archivedRoutine },
    bobRoutine: s.bobRoutine,
    missingRoutine: 999,
    archiveExercise: async (exerciseId) => {
      await s.exercises.setArchived(1, exerciseId, true);
    },
  };
});

describe("BrowserSessionRepository storage behaviour", () => {
  it("keeps sessions in the same snapshot as exercises and routines, dates included", async () => {
    const { storage, first } = await setup();
    const repo = new BrowserSessionRepository(storage);
    const session = await repo.start(1, null);
    await repo.addSet(1, session.id, first, { weightKg: 80, reps: 8, rpe: null, restSeconds: null });

    const raw = JSON.parse(storage.rawText()!);
    expect(raw).toMatchObject({ version: 1, exercises: { length: 4 }, routines: { length: 3 } });
    expect(raw.sessions).toMatchObject([{ id: session.id, userId: 1, sets: [{ exerciseId: first, setNumber: 1 }] }]);
    expect((await repo.findById(1, session.id))?.sets[0].completedAt).toBeInstanceOf(Date);
  });

  it("writes nothing when a check fails", async () => {
    const { storage, archived } = await setup();
    const repo = new BrowserSessionRepository(storage);
    const session = await repo.start(1, null);
    const before = storage.rawText();

    await expect(repo.addSet(1, session.id, archived, { weightKg: 80, reps: 8, rpe: null, restSeconds: null })).rejects.toThrow();
    await expect(repo.start(1, null)).rejects.toThrow();
    expect(storage.rawText()).toBe(before);
  });

  it("reports a storage failure instead of losing the change", async () => {
    const { storage } = await setup();
    const repo = new BrowserSessionRepository(storage);
    storage.failWritesWith("quota_exceeded");

    await expect(repo.start(1, null)).rejects.toMatchObject({ name: "GuestStorageError", reason: "quota_exceeded" });
    storage.failWritesWith(null);
    expect(await repo.findActive(1)).toBeNull();
  });
});
