import {
  GUEST_STORAGE_MESSAGES,
  GuestStorageError,
  serializeSnapshot,
  type GuestReadResult,
  type GuestStorage,
} from "@/modules/guest/storage/guest-storage";
import {
  GUEST_IMPORT_FAILED,
  GUEST_IMPORT_MAX_BYTES,
  GUEST_IMPORT_TOO_LARGE,
  payloadBytes,
  type GuestImportResult,
  type ImportCounts,
} from "../application/import-guest-data";

/*
 * Browser side of the guest import (S14): when to offer it, and what happens
 * when the user presses import. Nothing is sent before that.
 */

/** sessionStorage key: "Not now" hides the offer until this browser session ends. */
export const OFFER_DISMISSED_KEY = "gymple.guest-import.dismissed";

type SessionStore = Pick<Storage, "getItem" | "setItem">;
const browserSession = (): SessionStore => window.sessionStorage;

export type ImportOutcome =
  | { status: "imported"; summary: string; skipped: string[]; warning: string | null }
  | { status: "failed"; message: string };

export const CLEAR_FAILED_WARNING =
  "Your data was imported, but this browser would not let Gymple remove the guest copy. Open guest mode and use \"Delete guest data\" so it is not imported twice.";

export function shouldOfferImport(read: GuestReadResult, dismissed: boolean): boolean {
  if (dismissed || !read.ok) return false;
  const { exercises, routines, sessions } = read.snapshot;
  return exercises.length + routines.length + sessions.length > 0;
}

export function isOfferDismissed(session: () => SessionStore = browserSession): boolean {
  try {
    return session().getItem(OFFER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Best effort: if the browser blocks sessionStorage, the offer only hides until the next page load. */
export function dismissOffer(session: () => SessionStore = browserSession): void {
  try {
    session().setItem(OFFER_DISMISSED_KEY, "1");
  } catch {
    // Nothing to do: the caller hides the offer for this page anyway.
  }
}

/**
 * Sends the guest snapshot to the server and, once the server confirms the
 * import committed (even partially), removes it from this browser. After any
 * failure the guest data stays.
 */
export async function runGuestImport(
  storage: GuestStorage,
  send: (payload: string) => Promise<GuestImportResult>,
): Promise<ImportOutcome> {
  const read = storage.read();
  if (!read.ok) return { status: "failed", message: GUEST_STORAGE_MESSAGES[read.reason] };
  const payload = serializeSnapshot(read.snapshot);
  if (payloadBytes(payload) > GUEST_IMPORT_MAX_BYTES) return { status: "failed", message: GUEST_IMPORT_TOO_LARGE };

  let result: GuestImportResult;
  try {
    result = await send(payload);
  } catch {
    return { status: "failed", message: GUEST_IMPORT_FAILED };
  }
  if (!result.ok) return { status: "failed", message: result.message };

  let warning: string | null = null;
  try {
    storage.clear();
  } catch (error) {
    if (!(error instanceof GuestStorageError)) throw error;
    warning = CLEAR_FAILED_WARNING;
  }
  return { status: "imported", summary: summarizeImport(result.imported), skipped: result.skipped, warning };
}

export function summarizeImport(counts: ImportCounts): string {
  const parts = [
    plural(counts.exercises, "exercise"),
    plural(counts.routines, "routine"),
    counts.workouts > 0 ? `${plural(counts.workouts, "workout")} (${plural(counts.sets, "set")})` : null,
  ].filter((part): part is string => part !== null);
  const matched =
    counts.matchedExercises > 0
      ? `${counts.matchedExercises === 1 ? "1 exercise was" : `${counts.matchedExercises} exercises were`} already in your account, so its records now use that one.`
      : null;
  if (parts.length === 0) return matched ?? "Nothing was imported.";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return [`Imported ${list}.`, matched].filter(Boolean).join(" ");
}

function plural(n: number, noun: string): string | null {
  if (n === 0) return null;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
