import { GuestStorageError } from "../storage/guest-storage";

/** Runs a guest command, turning a storage failure into its user-facing message. */
export async function runGuestCommand<T>(
  run: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof GuestStorageError) return { ok: false, message: error.message };
    throw error;
  }
}
