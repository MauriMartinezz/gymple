import { describe, expect, it, vi } from "vitest";
import { emptyGuestSnapshot, GuestStorageError } from "./guest-storage";
import { InMemoryGuestStorage } from "./in-memory-guest-storage";

describe("InMemoryGuestStorage", () => {
  it("round-trips copies, so callers cannot mutate what is stored", () => {
    const storage = new InMemoryGuestStorage();
    const snapshot = emptyGuestSnapshot();
    storage.write(snapshot);
    snapshot.nextIds.exercise = 50;

    expect(storage.read()).toEqual({ ok: true, snapshot: emptyGuestSnapshot() });
  });

  it("can simulate failures", () => {
    const storage = new InMemoryGuestStorage();
    storage.failReadsWith("corrupted");
    expect(storage.read()).toEqual({ ok: false, reason: "corrupted" });

    storage.failWritesWith("quota_exceeded");
    expect(() => storage.write(emptyGuestSnapshot())).toThrow(GuestStorageError);
  });

  it("notifies subscribers after a write or a clear", () => {
    const storage = new InMemoryGuestStorage();
    const listener = vi.fn();
    const unsubscribe = storage.subscribe(listener);

    storage.write(emptyGuestSnapshot());
    storage.clear();
    unsubscribe();
    storage.clear();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
