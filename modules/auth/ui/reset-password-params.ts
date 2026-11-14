export type ResetPasswordView = { step: "choose"; token: string } | { step: "request"; linkRejected: boolean };

/**
 * Reads /reset-password's query. better-auth's emailed link redirects here
 * with `token=<TOKEN>` when it is valid, or `error=INVALID_TOKEN` when it is
 * not. Without either, the page offers to email a new link.
 */
export function resetPasswordView(params: { token?: string | string[]; error?: string | string[] }): ResetPasswordView {
  if (first(params.error)) return { step: "request", linkRejected: true };
  const token = first(params.token);
  return token ? { step: "choose", token } : { step: "request", linkRejected: false };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
