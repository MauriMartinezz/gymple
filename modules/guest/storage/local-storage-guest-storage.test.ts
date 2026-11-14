import { describe, expect, it } from "vitest";
import { emptyGuestSnapshot, GUEST_STORAGE_KEY, GuestStorageError, type GuestSnapshot } from "./guest-storage";
import { LocalStorageGuestStorage } from "./local-storage-guest-storage";

/** The subset of the Web Storage API the adapter uses, backed by a Map. */
class FakeStorage {
  readonly items = new Map<string, string>();
  quota = Infinity;
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (value.length > this.quota) {
      throw Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" });
    }
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const sample = (): GuestSnapshot => ({
  ...emptyGuestSnapshot(),
  nextIds: { exercise: 3, routine: 2 },
  exercises: [
    { id: 1, userId: 1, name: "Squat", muscleGroup: "legs", notes: null, archivedAt: null },
    { id: 2, userId: 1, name: "Curl", muscleGroup: "biceps", notes: "EZ", archivedAt: new Date("2026-01-02T03:04:05.000Z") },
  ],
  routines: [
    {
      id: 1,
      userId: 1,
      name: "Legs",
      description: null,
      items: [{ exerciseId: 1, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 90, notes: null }],
      archivedAt: null,
    },
  ],
});

describe("LocalStorageGuestStorage", () => {
  it("reads an empty snapshot when nothing is stored", () => {
    const storage = new LocalStorageGuestStorage(() => new FakeStorage());
    expect(storage.read()).toEqual({ ok: true, snapshot: emptyGuestSnapshot() });
  });

  it("round-trips a snapshot under one versioned key, dates included", () => {
    const backing = new FakeStorage();
    const storage = new LocalStorageGuestStorage(() => backing);

    storage.write(sample());

    expect([...backing.items.keys()]).toEqual([GUEST_STORAGE_KEY]);
    expect(JSON.parse(backing.items.get(GUEST_STORAGE_KEY)!)).toMatchObject({ version: 1 });
    const read = storage.read();
    expect(read).toEqual({ ok: true, snapshot: sample() });
    expect(read.ok && read.snapshot.exercises[1].archivedAt).toBeInstanceOf(Date);
  });

  it("reports corrupted JSON without throwing", () => {
    const backing = new FakeStorage();
    backing.items.set(GUEST_STORAGE_KEY, "{not json");
    expect(new LocalStorageGuestStorage(() => backing).read()).toEqual({ ok: false, reason: "corrupted" });
  });

  it.each([
    ["a non-object", "42"],
    ["missing collections", JSON.stringify({ version: 1, nextIds: {}, exercises: "x", routines: [] })],
    ["a row without an id", JSON.stringify({ version: 1, nextIds: {}, exercises: [{ userId: 1 }], routines: [] })],
    ["an invalid date", JSON.stringify({ version: 1, nextIds: {}, exercises: [{ id: 1, userId: 1, name: "A", muscleGroup: "legs", notes: null, archivedAt: "never" }], routines: [] })],
  ])("reports %s as corrupted", (_label, raw) => {
    const backing = new FakeStorage();
    backing.items.set(GUEST_STORAGE_KEY, raw);
    expect(new LocalStorageGuestStorage(() => backing).read()).toEqual({ ok: false, reason: "corrupted" });
  });

  it("reports an unknown version", () => {
    const backing = new FakeStorage();
    backing.items.set(GUEST_STORAGE_KEY, JSON.stringify({ ...sample(), version: 99 }));
    expect(new LocalStorageGuestStorage(() => backing).read()).toEqual({
      ok: false,
      reason: "unsupported_version",
    });
  });

  it("reports unavailable storage (e.g. blocked in a private window) on read, write and clear", () => {
    const storage = new LocalStorageGuestStorage(() => {
      throw Object.assign(new Error("The operation is insecure."), { name: "SecurityError" });
    });

    expect(storage.read()).toEqual({ ok: false, reason: "unavailable" });
    expect(() => storage.write(sample())).toThrow(GuestStorageError);
    expect(errorOf(() => storage.write(sample()))?.reason).toBe("unavailable");
    expect(errorOf(() => storage.clear())?.reason).toBe("unavailable");
  });

  it("reports a full quota on write and keeps the previous data", () => {
    const backing = new FakeStorage();
    const storage = new LocalStorageGuestStorage(() => backing);
    storage.write(emptyGuestSnapshot());
    backing.quota = 10;

    expect(errorOf(() => storage.write(sample()))?.reason).toBe("quota_exceeded");
    expect(storage.read()).toEqual({ ok: true, snapshot: emptyGuestSnapshot() });
  });

  it("clears the stored data", () => {
    const backing = new FakeStorage();
    const storage = new LocalStorageGuestStorage(() => backing);
    storage.write(sample());

    storage.clear();

    expect(backing.items.size).toBe(0);
    expect(storage.read()).toEqual({ ok: true, snapshot: emptyGuestSnapshot() });
  });
});

function errorOf(run: () => void): GuestStorageError | null {
  try {
    run();
    return null;
  } catch (error) {
    if (error instanceof GuestStorageError) return error;
    throw error;
  }
}
