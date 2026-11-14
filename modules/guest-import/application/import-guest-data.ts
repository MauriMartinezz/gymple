import { planGuestImport, UNREADABLE_GUEST_DATA, type GuestImportPlan } from "../domain/guest-import-plan";

/*
 * S14: imports a guest snapshot into the signed-in account. The caller passes
 * the user id from the session; the payload is untrusted text.
 */

/**
 * Largest payload accepted, in UTF-8 bytes. Half of Next's default 1 MB
 * server action body limit, so the action always receives the payload and
 * answers with this clear message instead of a framework error. A guest
 * trying the app stays far below it (a logged set is about 150 bytes).
 */
export const GUEST_IMPORT_MAX_BYTES = 512 * 1024;

export const GUEST_IMPORT_TOO_LARGE = "The guest data is too large to import (over 512 KB). Nothing was imported.";

/** An unexpected failure: the transaction rolled back. */
export const GUEST_IMPORT_FAILED =
  "Something went wrong, so nothing was imported. Your guest data is still in this browser; try again.";

export const ACTIVE_WORKOUT_NOT_IMPORTED =
  "Workout in progress: not imported because your account already has one in progress.";

export interface ImportCounts {
  /** Exercises created. */
  exercises: number;
  /** Guest exercises whose name the account already had; they now point at the account's exercise. */
  matchedExercises: number;
  routines: number;
  workouts: number;
  sets: number;
}

export interface GuestImportWriteResult {
  counts: ImportCounts;
  /** The plan had a workout in progress and the account already had one. */
  activeWorkoutSkipped: boolean;
}

/**
 * Writes a whole plan for one user, giving every record a new id and
 * rewriting every reference. All or nothing: if it throws, nothing was saved.
 */
export interface GuestImportWriter {
  write(userId: number, plan: GuestImportPlan): Promise<GuestImportWriteResult>;
}

export type GuestImportResult =
  | { ok: true; imported: ImportCounts; skipped: string[] }
  | { ok: false; message: string };

export function payloadBytes(payload: string): number {
  return new TextEncoder().encode(payload).length;
}

export async function importGuestData(
  writer: GuestImportWriter,
  userId: number,
  payload: unknown,
): Promise<GuestImportResult> {
  if (typeof payload !== "string") return { ok: false, message: UNREADABLE_GUEST_DATA };
  // Cheap upper bound first (a UTF-16 unit is at most 3 UTF-8 bytes), then the exact size.
  if (payload.length > GUEST_IMPORT_MAX_BYTES || payloadBytes(payload) > GUEST_IMPORT_MAX_BYTES) {
    return { ok: false, message: GUEST_IMPORT_TOO_LARGE };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, message: UNREADABLE_GUEST_DATA };
  }
  const planned = planGuestImport(raw);
  if (!planned.ok) return planned;

  const written = await writer.write(userId, planned.plan);
  const skipped = [...planned.plan.skipped];
  if (written.activeWorkoutSkipped) skipped.push(ACTIVE_WORKOUT_NOT_IMPORTED);
  return { ok: true, imported: written.counts, skipped };
}
