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
  nextIds: { exercise: 3, routine: 2, session: 3, set: 3 },
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
  sessions: [
    {
      id: 1,
      userId: 1,
      routineId: 1,
      startedAt: new Date("2026-01-03T10:00:00.000Z"),
      finishedAt: new Date("2026-01-03T11:00:00.000Z"),
      notes: "Good",
      sets: [
        { id: 1, exerciseId: 1, setNumber: 1, weightKg: 80.5, reps: 8, rpe: 8.5, restSeconds: 90, completedAt: new Date("2026-01-03T10:10:00.000Z") },
      ],
    },
    {
      id: 2,
      userId: 1,
      routineId: null,
      startedAt: new Date("2026-01-04T10:00:00.000Z"),
      finishedAt: null,
      notes: null,
      sets: [
        { id: 2, exerciseId: 2, setNumber: 1, weightKg: 20, reps: 12, rpe: null, restSeconds: null, completedAt: new Date("2026-01-04T10:05:00.000Z") },
      ],
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
    expect(read.ok && read.snapshot.sessions[0].sets[0].completedAt).toBeInstanceOf(Date);
  });

  it("reads a snapshot saved before workouts existed (no sessions, no session ids) as version 1", () => {
    const backing = new FakeStorage();
    const { nextIds, ...withSessions } = sample();
    const before = { exercises: withSessions.exercises, routines: withSessions.routines, version: withSessions.version };
    backing.items.set(
      GUEST_STORAGE_KEY,
      JSON.stringify({ ...before, nextIds: { exercise: nextIds.exercise, routine: nextIds.routine } }),
    );

    expect(new LocalStorageGuestStorage(() => backing).read()).toEqual({
      ok: true,
      snapshot: { ...before, nextIds: { exercise: 3, routine: 2, session: 1, set: 1 }, sessions: [] },
    });
  });

  it("never hands out a session or set id already in use, even if the counters were lost", () => {
    const backing = new FakeStorage();
    backing.items.set(GUEST_STORAGE_KEY, JSON.stringify({ ...sample(), nextIds: {} }));
    const read = new LocalStorageGuestStorage(() => backing).read();
    expect(read.ok && read.snapshot.nextIds).toEqual({ exercise: 3, routine: 2, session: 3, set: 3 });
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
    ["sessions that are not a list", JSON.stringify({ version: 1, nextIds: {}, sessions: {} })],
    ["a session without sets", JSON.stringify({ version: 1, nextIds: {}, sessions: [{ id: 1, userId: 1, routineId: null, startedAt: "2026-01-01T00:00:00.000Z", finishedAt: null, notes: null }] })],
    ["a set with a non-numeric weight", JSON.stringify({ version: 1, nextIds: {}, sessions: [{ id: 1, userId: 1, routineId: null, startedAt: "2026-01-01T00:00:00.000Z", finishedAt: null, notes: null, sets: [{ id: 1, exerciseId: 1, setNumber: 1, weightKg: "80", reps: 8, rpe: null, restSeconds: null, completedAt: "2026-01-01T00:00:00.000Z" }] }] })],
    ["a session without a start time", JSON.stringify({ version: 1, nextIds: {}, sessions: [{ id: 1, userId: 1, routineId: null, startedAt: null, finishedAt: null, notes: null, sets: [] }] })],
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
