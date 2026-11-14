import { db } from "@/infrastructure/db/client";
import { smtpEmailSenderFromEnv } from "@/infrastructure/email/smtp-email-sender";
import { createAuth } from "./create-auth";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment, and
// SMTP_URL / EMAIL_FROM when the first email is sent.
export const auth = createAuth({ db, emailSender: smtpEmailSenderFromEnv() });
