import type { AdminFlags } from "../domain/admin-flags";

const USAGE = "Usage: pnpm admin:grant <email>";

export interface GrantAdminRun {
  exitCode: 0 | 1;
  message: string;
}

/** Core of `pnpm admin:grant <email>`: the script only wires the database and prints the result. */
export async function runGrantAdmin(args: readonly string[], flags: AdminFlags): Promise<GrantAdminRun> {
  const email = args.length === 1 ? args[0].trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { exitCode: 1, message: USAGE };

  switch (await flags.grantByEmail(email)) {
    case "granted":
      return { exitCode: 0, message: `${email} is now an admin.` };
    case "already_admin":
      return { exitCode: 0, message: `${email} is already an admin.` };
    case "no_account":
      return {
        exitCode: 1,
        message: `No account uses ${email}. Create the account first, then run this again.`,
      };
  }
}
