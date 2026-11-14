import { describe, expect, it } from "vitest";
import { describeExerciseRepositoryContract } from "@/modules/exercises/testing/exercise-repository-contract";
import { GuestStorageError } from "../storage/guest-storage";
import { InMemoryGuestStorage } from "../storage/in-memory-guest-storage";
import { BrowserExerciseRepository } from "./browser-exercise-repository";

describeExerciseRepositoryContract("browser (guest storage)", async () => ({
  repo: new BrowserExerciseRepository(new InMemoryGuestStorage()),
  alice: 1,
  bob: 2,
}));

describe("BrowserExerciseRepository storage behaviour", () => {
  const squat = { name: "Squat", muscleGroup: "legs", notes: null } as const;

  it("persists through the storage, so a new instance sees the data", async () => {
    const storage = new InMemoryGuestStorage();
    const created = await new BrowserExerciseRepository(storage).create(1, squat);

    expect(await new BrowserExerciseRepository(storage).findById(1, created.id)).toEqual(created);
  });

  it("throws the storage failure on reads and saves nothing when a write fails", async () => {
    const storage = new InMemoryGuestStorage();
    const repo = new BrowserExerciseRepository(storage);
    storage.failWritesWith("quota_exceeded");

    await expect(repo.create(1, squat)).rejects.toBeInstanceOf(GuestStorageError);
    storage.failWritesWith(null);
    expect(await repo.list(1, { archived: false })).toEqual([]);

    storage.failReadsWith("corrupted");
    await expect(repo.list(1, { archived: false })).rejects.toMatchObject({ reason: "corrupted" });
  });
});
