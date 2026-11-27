import { eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { users } from "@/infrastructure/db/schema";
import type { AdminFlags, GrantAdminOutcome } from "../domain/admin-flags";

export class DrizzleAdminFlags implements AdminFlags {
  constructor(private readonly db: Db) {}

  async isAdmin(userId: number): Promise<boolean> {
    const [row] = await this.db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
    return row?.isAdmin === true;
  }

  async grantByEmail(email: string): Promise<GrantAdminOutcome> {
    // users.email uses the case-insensitive collation.
    const [row] = await this.db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.email, email));
    if (!row) return "no_account";
    if (row.isAdmin) return "already_admin";
    await this.db.update(users).set({ isAdmin: true }).where(eq(users.id, row.id));
    return "granted";
  }
}
