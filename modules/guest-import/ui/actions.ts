"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { GUEST_IMPORT_FAILED, importGuestData, type GuestImportResult } from "../application/import-guest-data";
import { guestImportWriter } from "./guest-import-service";

export type { GuestImportResult } from "../application/import-guest-data";

/**
 * Imports the guest snapshot (S14). The payload is untrusted text: the user
 * id comes only from the session, and the use case checks size, shape and
 * every record. An unexpected failure rolls everything back.
 */
export async function importGuestDataAction(payload: unknown): Promise<GuestImportResult> {
  const user = await requireUser();
  let result: GuestImportResult;
  try {
    result = await importGuestData(guestImportWriter, user.id, payload);
  } catch (error) {
    console.error("Guest import failed", error);
    return { ok: false, message: GUEST_IMPORT_FAILED };
  }
  // Lists on the current page now include the imported records.
  if (result.ok) refresh();
  return result;
}
