export type VerifyEmailResult = "verified" | "expired" | "invalid" | "pending";

/**
 * Reads the result page's query: better-auth redirects with `status=verified`
 * on success and adds `error=<CODE>` on failure.
 */
export function verifyEmailResult(params: { status?: string | string[]; error?: string | string[] }): VerifyEmailResult {
  const error = first(params.error);
  if (error === "TOKEN_EXPIRED") return "expired";
  if (error) return "invalid";
  if (first(params.status) === "verified") return "verified";
  return "pending";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
