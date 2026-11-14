import { describe, expect, it } from "vitest";
import { BrowserExerciseRepository } from "../infrastructure/browser-exercise-repository";
import { GUEST_USER_ID } from "../storage/guest-storage";
import { InMemoryGuestStorage } from "../storage/in-memory-guest-storage";
import { deleteGuestData } from "./delete-guest-data";

describe("deleteGuestData", () => {
  it("removes every guest record", async () => {
    const storage = new InMemoryGuestStorage();
    const repo = new BrowserExerciseRepository(storage);
    await repo.create(GUEST_USER_ID, { name: "Squat", muscleGroup: "legs", notes: null });

    expect(deleteGuestData(storage)).toEqual({ ok: true });
    expect(storage.rawText()).toBeNull();
    expect(await repo.list(GUEST_USER_ID, { archived: false })).toEqual([]);
  });

  it("also recovers from corrupted data", () => {
    const storage = new InMemoryGuestStorage();
    storage.failReadsWith("corrupted");

    expect(deleteGuestData(storage)).toEqual({ ok: true });
    expect(storage.read().ok).toBe(true);
  });

  it("reports when the browser blocks storage", () => {
    const storage = new InMemoryGuestStorage();
    storage.failWritesWith("unavailable");

    expect(deleteGuestData(storage)).toEqual({ ok: false, message: expect.stringMatching(/not letting Gymple/) });
  });
});
