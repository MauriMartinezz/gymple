import { describe, expect, it } from "vitest";
import { RESET_PASSWORD_PATH, setPasswordEmail } from "./set-password-email";

describe("setPasswordEmail", () => {
  it("addresses the account and includes the link", () => {
    const message = setPasswordEmail({ name: "Ana", email: "ana@example.com" }, "https://x.test/r?a=1&b=2");

    expect(message.to).toBe("ana@example.com");
    expect(message.subject).toBe("Choose your Gymple password");
    expect(message.text).toContain("https://x.test/r?a=1&b=2");
    expect(message.html).toContain('href="https://x.test/r?a=1&amp;b=2"');
    expect(message.text).toContain("expires in 1 hour");
  });

  // Names are typed by other people (an admin, or whoever signed up with this
  // address), so they never reach the inbox.
  it("leaves the account name out of the email", () => {
    const name = "Visit http://phish.example now";
    const message = setPasswordEmail({ name, email: "victim@example.com" }, "https://x.test");

    expect(message.text).not.toContain(name);
    expect(message.html).not.toContain("phish.example");
  });

  it("sends people to the reset-password page", () => {
    expect(RESET_PASSWORD_PATH).toBe("/reset-password");
  });
});
