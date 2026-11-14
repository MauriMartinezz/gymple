/**
 * Port: the account emails the admin flows trigger. The auth adapter sends
 * them through better-auth (password reset and email verification), which
 * delivers through the EmailSender port.
 */
export interface AccountEmails {
  /** A "choose your password" link for an account the admin created. */
  sendSetPassword(email: string): Promise<void>;
  /** A verification link to an account's (new) unverified email. */
  sendEmailVerification(email: string): Promise<void>;
}
