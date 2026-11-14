import { describe, expect, it } from "vitest";
import { describeRoutineRepositoryContract } from "@/modules/routines/testing/routine-repository-contract";
import { InMemoryGuestStorage } from "../storage/in-memory-guest-storage";
import { BrowserExerciseRepository } from "./browser-exercise-repository";
import { BrowserRoutineRepository } from "./browser-routine-repository";

/** Exercises come from the same guest storage, through the exercise adapter. */
async function setup() {
  const storage = new InMemoryGuestStorage();
  const exercises = new BrowserExerciseRepository(storage);
  const first = await exercises.create(1, { name: "Squat", muscleGroup: "legs", notes: null });
  const second = await exercises.create(1, { name: "Curl", muscleGroup: "biceps", notes: null });
  await exercises.setArchived(1, second.id, true); // archived exercises still belong to their owner
  const bobs = await exercises.create(2, { name: "Row", muscleGroup: "back", notes: null });
  return { storage, first: first.id, second: second.id, bobs: bobs.id };
}

describeRoutineRepositoryContract("browser (guest storage)", async () => {
  const { storage, first, second, bobs } = await setup();
  return {
    repo: new BrowserRoutineRepository(storage),
    alice: 1,
    bob: 2,
    aliceExercises: [first, second],
    bobExercise: bobs,
    missingExercise: 999,
  };
});

describe("BrowserRoutineRepository storage behaviour", () => {
  it("keeps exercises and routines in one snapshot, with separate ids", async () => {
    const { storage, first } = await setup();
    const routine = await new BrowserRoutineRepository(storage).create(1, {
      name: "Legs",
      description: null,
      items: [{ exerciseId: first, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 90, notes: null }],
    });

    expect(routine.id).toBe(1);
    expect(JSON.parse(storage.rawText()!)).toMatchObject({ exercises: { length: 3 }, routines: [{ name: "Legs" }] });
  });
});
