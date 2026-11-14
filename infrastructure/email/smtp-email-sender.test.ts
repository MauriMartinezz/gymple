import { describe, expect, it } from "vitest";
import { verificationEmail } from "@/modules/auth/application/verification-email";
import { SmtpEmailSender, type MailTransport } from "./smtp-email-sender";

class StubTransport implements MailTransport {
  readonly sent: Parameters<MailTransport["sendMail"]>[0][] = [];
  async sendMail(mail: Parameters<MailTransport["sendMail"]>[0]) {
    this.sent.push(mail);
    return {};
  }
}

describe("SmtpEmailSender", () => {
  it("sends the message from EMAIL_FROM to the recipient", async () => {
    const transport = new StubTransport();
    const sender = new SmtpEmailSender(transport, "Gymple <no-reply@gymple.com>");
    const link = "http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email";

    await sender.send(verificationEmail({ name: "Ana", email: "ana@example.com" }, link));

    expect(transport.sent).toHaveLength(1);
    const [mail] = transport.sent;
    expect(mail.from).toBe("Gymple <no-reply@gymple.com>");
    expect(mail.to).toBe("ana@example.com");
    expect(mail.subject).toBe("Verify your email for Gymple");
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(link.replaceAll("&", "&amp;"));
  });

  it("propagates transport failures", async () => {
    const sender = new SmtpEmailSender(
      { sendMail: async () => Promise.reject(new Error("connection refused")) },
      "a@b.c",
    );
    await expect(
      sender.send({ to: "x@y.z", subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow("connection refused");
  });
});
