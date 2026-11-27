/**
 * The name of the unique index a Postgres unique_violation (23505) broke, or
 * null for any other error. Drizzle may wrap the driver error in
 * DrizzleQueryError.cause, so the cause chain is followed.
 */
export function uniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint } = current as { code?: string; constraint?: string };
    if (code === "23505") return constraint ?? "";
    current = current.cause;
  }
  return null;
}
