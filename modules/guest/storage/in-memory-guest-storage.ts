import {
  emptyGuestSnapshot,
  GuestStorageError,
  parseSnapshot,
  serializeSnapshot,
  type GuestReadResult,
  type GuestSnapshot,
  type GuestStorage,
  type GuestStorageFailure,
} from "./guest-storage";

/**
 * GuestStorage kept in memory, for tests. Stores the serialized text, so it
 * round-trips exactly like localStorage (dates included), and can simulate
 * read and write failures.
 */
export class InMemoryGuestStorage implements GuestStorage {
  private text: string | null = null;
  private readFailure: Exclude<GuestStorageFailure, "quota_exceeded"> | null = null;
  private writeFailure: "unavailable" | "quota_exceeded" | null = null;
  private readonly listeners = new Set<() => void>();

  read(): GuestReadResult {
    if (this.readFailure) return { ok: false, reason: this.readFailure };
    return this.text === null ? { ok: true, snapshot: emptyGuestSnapshot() } : parseSnapshot(this.text);
  }

  write(snapshot: GuestSnapshot): void {
    if (this.writeFailure) throw new GuestStorageError(this.writeFailure);
    this.text = serializeSnapshot(snapshot);
    this.notify();
  }

  clear(): void {
    if (this.writeFailure === "unavailable") throw new GuestStorageError("unavailable");
    this.text = null;
    this.readFailure = null;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  failReadsWith(reason: Exclude<GuestStorageFailure, "quota_exceeded"> | null) {
    this.readFailure = reason;
  }

  failWritesWith(reason: "unavailable" | "quota_exceeded" | null) {
    this.writeFailure = reason;
  }

  /** Raw stored text, as localStorage would hold it. */
  rawText(): string | null {
    return this.text;
  }

  private notify() {
    for (const listener of [...this.listeners]) listener();
  }
}
