/** A ready-to-send email. `html` and `text` carry the same content. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Port: delivers emails. Adapters: SMTP in the app, in-memory in tests. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
