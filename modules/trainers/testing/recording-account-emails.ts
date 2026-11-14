import type { AccountEmails } from "../application/account-emails";

export type RecordedAccountEmail = { kind: "set_password" | "verify_email"; to: string };

/** Test double: records which account emails were requested. */
export class RecordingAccountEmails implements AccountEmails {
  readonly sent: RecordedAccountEmail[] = [];
  /** Makes every send fail, to test delivery errors. */
  failWith: Error | null = null;

  async sendSetPassword(email: string): Promise<void> {
    this.record({ kind: "set_password", to: email });
  }

  async sendEmailVerification(email: string): Promise<void> {
    this.record({ kind: "verify_email", to: email });
  }

  private record(email: RecordedAccountEmail) {
    if (this.failWith) throw this.failWith;
    this.sent.push(email);
  }
}
