import type { SessionRepositories, SessionUnitOfWork } from "@/modules/sessions/application/session-unit-of-work";
import {
  emptyGuestSnapshot,
  readSnapshotOrThrow,
  type GuestReadResult,
  type GuestSnapshot,
  type GuestStorage,
} from "../storage/guest-storage";
import { BrowserRoutineRepository } from "./browser-routine-repository";
import { BrowserSessionRepository } from "./browser-session-repository";

/**
 * SessionUnitOfWork for guests. The work runs against a private copy of the
 * snapshot; only when it resolves is that copy saved, in one storage write.
 * If the work throws, or that write fails, the stored data is untouched, so
 * finishing a workout and updating its routine happen together or not at all.
 *
 * @throws GuestStorageError when the storage cannot be read or written.
 */
export class BrowserSessionUnitOfWork implements SessionUnitOfWork {
  constructor(private readonly storage: GuestStorage) {}

  async run<T>(work: (repos: SessionRepositories) => Promise<T>): Promise<T> {
    const buffer = new BufferedGuestStorage(readSnapshotOrThrow(this.storage));
    const result = await work({
      sessions: new BrowserSessionRepository(buffer),
      routines: new BrowserRoutineRepository(buffer),
    });
    if (buffer.changed) this.storage.write(buffer.current());
    return result;
  }
}

/** Holds the work's writes in memory; nothing reaches the real storage. */
class BufferedGuestStorage implements GuestStorage {
  changed = false;

  constructor(private snapshot: GuestSnapshot) {}

  read(): GuestReadResult {
    return { ok: true, snapshot: structuredClone(this.snapshot) };
  }

  write(snapshot: GuestSnapshot): void {
    this.snapshot = structuredClone(snapshot);
    this.changed = true;
  }

  clear(): void {
    this.write(emptyGuestSnapshot());
  }

  subscribe(): () => void {
    return () => {};
  }

  current(): GuestSnapshot {
    return this.snapshot;
  }
}
