import { GuestStorageError, type GuestStorage } from "../storage/guest-storage";

/** Deletes every guest record, corrupted data included. */
export function deleteGuestData(storage: GuestStorage): { ok: true } | { ok: false; message: string } {
  try {
    storage.clear();
    return { ok: true };
  } catch (error) {
    if (error instanceof GuestStorageError) return { ok: false, message: error.message };
    throw error;
  }
}
