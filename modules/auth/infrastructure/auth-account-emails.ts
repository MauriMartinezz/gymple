import type { AccountEmails } from "@/modules/trainers/application/account-emails";
import { RESET_PASSWORD_PATH } from "../application/set-password-email";
import { VERIFY_EMAIL_RESULT_PATH } from "../application/verification-email";
import type { Auth } from "./create-auth";

/**
 * Sends account emails through better-auth's own flows, so the links carry
 * its tokens: the password reset flow for "choose your password" and the
 * verification flow for a changed email. Both deliver through the auth's
 * EmailSender.
 *
 * Called without request headers on purpose: with the admin's session,
 * better-auth would try to verify the admin's own email instead.
 */
export class AuthAccountEmails implements AccountEmails {
  constructor(private readonly auth: Auth) {}

  async sendSetPassword(email: string): Promise<void> {
    await this.auth.api.requestPasswordReset({ body: { email, redirectTo: RESET_PASSWORD_PATH } });
  }

  async sendEmailVerification(email: string): Promise<void> {
    await this.auth.api.sendVerificationEmail({ body: { email, callbackURL: VERIFY_EMAIL_RESULT_PATH } });
  }
}
