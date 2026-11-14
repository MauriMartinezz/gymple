import type { EmailMessage } from "@/infrastructure/email/email-sender";

/** Where better-auth redirects after checking a verification link. */
export const VERIFY_EMAIL_RESULT_PATH = "/verify-email?status=verified";

/**
 * Points a better-auth verification link at our result page. better-auth
 * appends `error=<CODE>` to it when the token is invalid or expired.
 */
export function verificationLink(url: string): string {
  const link = new URL(url);
  link.searchParams.set("callbackURL", VERIFY_EMAIL_RESULT_PATH);
  return link.toString();
}

export function verificationEmail(user: { name: string; email: string }, link: string): EmailMessage {
  const subject = "Verify your email for Gymple";
  const text = [
    `Hi ${user.name},`,
    "",
    "Confirm your email address to start using Gymple:",
    link,
    "",
    "The link expires in 1 hour. If you didn't create an account, ignore this email.",
  ].join("\n");
  const html = [
    `<p>Hi ${escapeHtml(user.name)},</p>`,
    "<p>Confirm your email address to start using Gymple:</p>",
    `<p><a href="${escapeHtml(link)}">Verify my email</a></p>`,
    "<p>The link expires in 1 hour. If you didn't create an account, ignore this email.</p>",
  ].join("\n");
  return { to: user.email, subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
