import {
  emptyGuestSnapshot,
  GUEST_STORAGE_KEY,
  GuestStorageError,
  parseSnapshot,
  serializeSnapshot,
  type GuestReadResult,
  type GuestSnapshot,
  type GuestStorage,
} from "./guest-storage";

type WebStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Guest snapshot in `localStorage`. The storage is resolved on every call
 * (never at import), so this module is safe to import during prerendering,
 * and a browser that blocks storage (Safari private mode, disabled site data)
 * yields "unavailable" instead of an exception.
 */
export class LocalStorageGuestStorage implements GuestStorage {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly resolveStorage: () => WebStorage = () => window.localStorage) {}

  read(): GuestReadResult {
    let text: string | null;
    try {
      text = this.resolveStorage().getItem(GUEST_STORAGE_KEY);
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    return text === null ? { ok: true, snapshot: emptyGuestSnapshot() } : parseSnapshot(text);
  }

  write(snapshot: GuestSnapshot): void {
    const storage = this.storageOrThrow();
    try {
      storage.setItem(GUEST_STORAGE_KEY, serializeSnapshot(snapshot));
    } catch (error) {
      throw new GuestStorageError(isQuotaError(error) ? "quota_exceeded" : "unavailable");
    }
    this.notify();
  }

  clear(): void {
    const storage = this.storageOrThrow();
    try {
      storage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      throw new GuestStorageError("unavailable");
    }
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    // Other tabs changing the same key.
    const onStorage = (event: StorageEvent) => {
      if (event.key === GUEST_STORAGE_KEY || event.key === null) listener();
    };
    const target = typeof window === "undefined" ? null : window;
    target?.addEventListener("storage", onStorage);
    return () => {
      this.listeners.delete(listener);
      target?.removeEventListener("storage", onStorage);
    };
  }

  private storageOrThrow(): WebStorage {
    try {
      return this.resolveStorage();
    } catch {
      throw new GuestStorageError("unavailable");
    }
  }

  private notify() {
    for (const listener of [...this.listeners]) listener();
  }
}

/** Browsers name it differently (Firefox: NS_ERROR_DOM_QUOTA_REACHED; legacy code 22). */
function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
}
