import { describe, expect, it } from "vitest";
import type { AdminFlags, GrantAdminOutcome } from "../domain/admin-flags";
import { runGrantAdmin } from "./grant-admin";

/** In-memory accounts with an admin flag, keyed by lowercase email. */
class FakeAdminFlags implements AdminFlags {
  readonly granted: string[] = [];
  constructor(private readonly accounts: Map<string, boolean>) {}

  async isAdmin(): Promise<boolean> {
    throw new Error("not used");
  }

  async grantByEmail(email: string): Promise<GrantAdminOutcome> {
    const current = this.accounts.get(email.toLowerCase());
    if (current === undefined) return "no_account";
    if (current) return "already_admin";
    this.accounts.set(email.toLowerCase(), true);
    this.granted.push(email);
    return "granted";
  }
}

const accounts = () => new FakeAdminFlags(new Map([["ana@example.com", false], ["root@example.com", true]]));

describe("runGrantAdmin", () => {
  it("grants the admin flag to an existing account, normalizing the email", async () => {
    const flags = accounts();

    expect(await runGrantAdmin([" Ana@Example.com "], flags)).toEqual({
      exitCode: 0,
      message: "ana@example.com is now an admin.",
    });
    expect(flags.granted).toEqual(["ana@example.com"]);
  });

  it("succeeds without changes for an account that is already an admin", async () => {
    const flags = accounts();

    expect(await runGrantAdmin(["root@example.com"], flags)).toEqual({
      exitCode: 0,
      message: "root@example.com is already an admin.",
    });
    expect(flags.granted).toEqual([]);
  });

  it("fails for an email without an account", async () => {
    const flags = accounts();

    expect(await runGrantAdmin(["nobody@example.com"], flags)).toEqual({
      exitCode: 1,
      message: "No account uses nobody@example.com. Create the account first, then run this again.",
    });
    expect(flags.granted).toEqual([]);
  });

  it.each([[[]], [[""]], [["ana@example.com", "root@example.com"]], [["not-an-email"]]])(
    "prints the usage for %j",
    async (args) => {
      const flags = accounts();

      expect(await runGrantAdmin(args, flags)).toEqual({ exitCode: 1, message: "Usage: pnpm admin:grant <email>" });
      expect(flags.granted).toEqual([]);
    },
  );
});
