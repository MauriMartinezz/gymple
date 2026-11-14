import type { EmailMessage, EmailSender } from "../email-sender";

/** Test double: keeps sent emails in memory. */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  clear(): void {
    this.sent.length = 0;
  }

  /** The first link in the latest email sent to `to`. */
  lastLinkTo(to: string): string {
    const message = this.sent.findLast((m) => m.to === to);
    if (!message) throw new Error(`No email was sent to ${to}.`);
    const link = message.text.match(/https?:\/\/\S+/)?.[0];
    if (!link) throw new Error(`The email to ${to} has no link.`);
    return link;
  }
}
