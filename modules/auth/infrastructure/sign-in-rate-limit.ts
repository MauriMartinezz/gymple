export interface SignInRateLimit {
  /** Attempts allowed per IP within the window. */
  max: number;
  /** Window length in seconds. */
  window: number;
}

const DEFAULTS: SignInRateLimit = { max: 10, window: 15 * 60 };

/**
 * Reads the sign-in rate limit from the environment.
 * Throws on invalid values so a typo never silently disables the limit.
 */
export function signInRateLimitFromEnv(
  env: Record<string, string | undefined> = process.env,
): SignInRateLimit {
  return {
    max: positiveInteger(env, "AUTH_SIGN_IN_MAX_ATTEMPTS") ?? DEFAULTS.max,
    window: positiveInteger(env, "AUTH_SIGN_IN_WINDOW_SECONDS") ?? DEFAULTS.window,
  };
}

function positiveInteger(env: Record<string, string | undefined>, name: string): number | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;

  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error(`${name} must be a positive integer, got "${raw}".`);
  }
  return Number(raw);
}
