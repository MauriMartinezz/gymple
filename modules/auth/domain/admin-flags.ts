/*
 * Admin is a capability on top of the account (S7), stored as a flag on the
 * users table. There is no UI to grant it: the first admin is granted with
 * `pnpm admin:grant <email>` (S9). better-auth never reads or writes it, and
 * its endpoints ignore it in request bodies (it is not a declared field).
 */

export type GrantAdminOutcome = "granted" | "already_admin" | "no_account";

/** Port: reads and grants the admin flag. Always read from the database, never from the session. */
export interface AdminFlags {
  isAdmin(userId: number): Promise<boolean>;
  /** Email is matched case-insensitively. */
  grantByEmail(email: string): Promise<GrantAdminOutcome>;
}
