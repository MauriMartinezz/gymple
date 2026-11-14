import { describe, expect, it, vi } from "vitest";
import { BrowserExerciseRepository } from "@/modules/guest/infrastructure/browser-exercise-repository";
import { GUEST_USER_ID } from "@/modules/guest/storage/guest-storage";
import { InMemoryGuestStorage } from "@/modules/guest/storage/in-memory-guest-storage";
import { GUEST_IMPORT_MAX_BYTES, type GuestImportResult } from "../application/import-guest-data";
import {
  dismissOffer,
  isOfferDismissed,
  OFFER_DISMISSED_KEY,
  runGuestImport,
  shouldOfferImport,
  summarizeImport,
} from "./guest-import-flow";

async function storageWithSquat(notes: string | null = null) {
  const storage = new InMemoryGuestStorage();
  await new BrowserExerciseRepository(storage).create(GUEST_USER_ID, { name: "Squat", muscleGroup: "legs", notes });
  return storage;
}

function fakeSessionStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

const blocked = () => {
  throw new DOMException("blocked", "SecurityError");
};

const imported = (skipped: string[] = []): GuestImportResult => ({
  ok: true,
  imported: { exercises: 1, matchedExercises: 0, routines: 0, workouts: 0, sets: 0 },
  skipped,
});

describe("the import offer", () => {
  it("is shown only when this browser holds at least one guest record", async () => {
    expect(shouldOfferImport(new InMemoryGuestStorage().read(), false)).toBe(false);
    expect(shouldOfferImport((await storageWithSquat()).read(), false)).toBe(true);
  });

  it("is not shown for guest data that cannot be read", () => {
    const storage = new InMemoryGuestStorage();
    storage.failReadsWith("corrupted");
    expect(shouldOfferImport(storage.read(), false)).toBe(false);
  });

  it('stays hidden for the browser session after "Not now"', async () => {
    const session = fakeSessionStorage();
    expect(isOfferDismissed(() => session)).toBe(false);

    dismissOffer(() => session);

    expect(session.values.get(OFFER_DISMISSED_KEY)).toBe("1");
    expect(isOfferDismissed(() => session)).toBe(true);
    expect(shouldOfferImport((await storageWithSquat()).read(), isOfferDismissed(() => session))).toBe(false);
  });

  it("still works when the browser blocks session storage", () => {
    expect(isOfferDismissed(blocked)).toBe(false);
    expect(() => dismissOffer(blocked)).not.toThrow();
  });
});

describe("runGuestImport", () => {
  it("sends the snapshot and clears the guest data once the server confirms the import", async () => {
    const storage = await storageWithSquat();
    const send = vi.fn<(payload: string) => Promise<GuestImportResult>>(async () => imported());

    const outcome = await runGuestImport(storage, send);

    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({ version: 1, exercises: [{ name: "Squat" }] });
    expect(outcome).toEqual({ status: "imported", summary: "Imported 1 exercise.", skipped: [], warning: null });
    expect(storage.rawText()).toBeNull();
  });

  it("also clears the guest data after a partial import, and lists what was skipped", async () => {
    const storage = await storageWithSquat();

    const outcome = await runGuestImport(storage, async () => imported(['Routine "Legs": no exercises left to import.']));

    expect(outcome).toMatchObject({ status: "imported", skipped: ['Routine "Legs": no exercises left to import.'] });
    expect(storage.rawText()).toBeNull();
  });

  it("keeps the guest data when the server refuses the import", async () => {
    const storage = await storageWithSquat();
    const before = storage.rawText();

    const outcome = await runGuestImport(storage, async () => ({ ok: false, message: "Nothing was imported." }));

    expect(outcome).toEqual({ status: "failed", message: "Nothing was imported." });
    expect(storage.rawText()).toBe(before);
  });

  it("keeps the guest data when the request itself fails", async () => {
    const storage = await storageWithSquat();
    const before = storage.rawText();

    const outcome = await runGuestImport(storage, async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(outcome).toEqual({ status: "failed", message: expect.stringMatching(/nothing was imported/i) });
    expect(storage.rawText()).toBe(before);
  });

  it("does not send guest data over the size limit", async () => {
    const storage = new InMemoryGuestStorage();
    const repo = new BrowserExerciseRepository(storage);
    for (let i = 0; i < 600; i += 1) {
      await repo.create(GUEST_USER_ID, { name: `Exercise ${i}`, muscleGroup: "legs", notes: "x".repeat(1000) });
    }
    expect(storage.rawText()!.length).toBeGreaterThan(GUEST_IMPORT_MAX_BYTES);
    const send = vi.fn(async () => imported());

    const outcome = await runGuestImport(storage, send);

    expect(outcome).toEqual({ status: "failed", message: expect.stringMatching(/too large/) });
    expect(send).not.toHaveBeenCalled();
    expect(storage.rawText()).not.toBeNull();
  });

  it("reports when the import worked but the browser would not delete the guest data", async () => {
    const storage = await storageWithSquat();
    storage.failWritesWith("unavailable");

    const outcome = await runGuestImport(storage, async () => imported());

    expect(outcome).toMatchObject({ status: "imported", warning: expect.stringMatching(/Delete guest data/) });
  });

  it("sends nothing when the guest data cannot be read", async () => {
    const storage = new InMemoryGuestStorage();
    storage.failReadsWith("unavailable");
    const send = vi.fn(async () => imported());

    expect(await runGuestImport(storage, send)).toMatchObject({ status: "failed" });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("summarizeImport", () => {
  it("names what was imported, in plain words", () => {
    expect(summarizeImport({ exercises: 2, matchedExercises: 1, routines: 1, workouts: 3, sets: 12 })).toBe(
      "Imported 2 exercises, 1 routine and 3 workouts (12 sets). 1 exercise was already in your account, so its records now use that one.",
    );
    expect(summarizeImport({ exercises: 0, matchedExercises: 0, routines: 0, workouts: 0, sets: 0 })).toBe(
      "Nothing was imported.",
    );
    expect(summarizeImport({ exercises: 0, matchedExercises: 3, routines: 0, workouts: 1, sets: 4 })).toBe(
      "Imported 1 workout (4 sets). 3 exercises were already in your account, so their records now use the account's exercises.",
    );
  });
});
