/** The parts of a better-auth client error the messages depend on. */
export interface AuthError {
  status: number;
  code?: string;
}

const GENERIC = "Something went wrong. Please try again.";

export function signInErrorMessage(error: AuthError, retryAfterSeconds: number | null): string {
  if (error.status === 429) {
    if (!retryAfterSeconds) return "Too many sign-in attempts. Please try again later.";
    const minutes = Math.ceil(retryAfterSeconds / 60);
    return `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  // better-auth only reports this after checking the password, and re-sends the link.
  if (error.code === "EMAIL_NOT_VERIFIED") {
    return "Please verify your email first. We've sent you a new verification link.";
  }
  // Same message for unknown email and wrong password: don't reveal which accounts exist.
  if (error.status === 401) return "Invalid email or password.";
  return GENERIC;
}

const SIGN_UP_MESSAGES: Record<string, string> = {
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "Password must be at most 128 characters.",
  INVALID_EMAIL: "Enter a valid email address.",
};

export function signUpErrorMessage(error: AuthError): string {
  if (error.status === 429) return "Too many sign-up attempts. Please try again later.";
  return (error.code && SIGN_UP_MESSAGES[error.code]) || GENERIC;
}

const RESET_PASSWORD_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "This link is not valid or has expired. Ask for a new one below.",
  PASSWORD_TOO_SHORT: SIGN_UP_MESSAGES.PASSWORD_TOO_SHORT,
  PASSWORD_TOO_LONG: SIGN_UP_MESSAGES.PASSWORD_TOO_LONG,
};

export function resetPasswordErrorMessage(error: AuthError): string {
  if (error.status === 429) return "Too many attempts. Please try again later.";
  return (error.code && RESET_PASSWORD_MESSAGES[error.code]) || GENERIC;
}
