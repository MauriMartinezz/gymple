import type { EmailMessage } from "@/infrastructure/email/email-sender";
import { escapeHtml } from "./verification-email";

/** Page that receives better-auth's password reset redirect (`?token=` or `?error=`). */
export const RESET_PASSWORD_PATH = "/reset-password";

/**
 * Sent for both a trainer account the admin created and a "forgot your
 * password" request: either way the person chooses a new password.
 * Never includes names: they are typed by other people.
 */
export function setPasswordEmail(user: { name: string; email: string }, link: string): EmailMessage {
  const subject = "Choose your Gymple password";
  const text = [
    "Hi,",
    "",
    "Use this link to choose a password for your Gymple account:",
    link,
    "",
    "The link expires in 1 hour. You can ask for a new one from the same page.",
    "If you didn't expect this email, ignore it: your account stays as it is.",
  ].join("\n");
  const html = [
    "<p>Hi,</p>",
    "<p>Use this link to choose a password for your Gymple account:</p>",
    `<p><a href="${escapeHtml(link)}">Choose my password</a></p>`,
    "<p>The link expires in 1 hour. You can ask for a new one from the same page.</p>",
    "<p>If you didn't expect this email, ignore it: your account stays as it is.</p>",
  ].join("\n");
  return { to: user.email, subject, text, html };
}
