import { describe, expect, it } from "vitest";
import { VERIFY_EMAIL_RESULT_PATH, verificationEmail, verificationLink } from "./verification-email";

const base = "http://localhost:3000/api/auth/verify-email?token=t0k3n";

describe("verificationLink", () => {
  it("sends the user to the verification result page", () => {
    const link = new URL(verificationLink(`${base}&callbackURL=%2F`));
    expect(link.searchParams.get("token")).toBe("t0k3n");
    expect(link.searchParams.get("callbackURL")).toBe(VERIFY_EMAIL_RESULT_PATH);
  });

  it("adds the result page when better-auth gave no callback", () => {
    const link = new URL(verificationLink(base));
    expect(link.searchParams.get("callbackURL")).toBe(VERIFY_EMAIL_RESULT_PATH);
  });
});

describe("verificationEmail", () => {
  it("addresses the user and includes the link", () => {
    const message = verificationEmail({ name: "Ana", email: "ana@example.com" }, "https://x.test/v?a=1&b=2");
    expect(message.to).toBe("ana@example.com");
    expect(message.subject).toBe("Verify your email for Gymple");
    expect(message.text).toContain("Hi Ana,");
    expect(message.text).toContain("https://x.test/v?a=1&b=2");
    expect(message.html).toContain('href="https://x.test/v?a=1&amp;b=2"');
  });

  it("escapes the name in the HTML body", () => {
    const message = verificationEmail({ name: "<b>Eve</b>", email: "eve@example.com" }, "https://x.test");
    expect(message.html).not.toContain("<b>Eve</b>");
    expect(message.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
  });
});
