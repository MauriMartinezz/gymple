import { createTransport } from "nodemailer";
import { emailConfigFromEnv } from "./email-config";
import type { EmailMessage, EmailSender } from "./email-sender";

/** The part of a nodemailer transport this adapter uses. */
export interface MailTransport {
  sendMail(mail: EmailMessage & { from: string }): Promise<unknown>;
}

/** Sends emails through an SMTP server. */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/**
 * An SMTP sender configured from the environment on first use, so building
 * the app does not require SMTP settings.
 */
export function smtpEmailSenderFromEnv(): EmailSender {
  let sender: SmtpEmailSender | undefined;
  return {
    send(message) {
      if (!sender) {
        const { smtpUrl, from } = emailConfigFromEnv();
        sender = new SmtpEmailSender(createTransport(smtpUrl), from);
      }
      return sender.send(message);
    },
  };
}
