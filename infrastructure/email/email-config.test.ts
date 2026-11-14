import { describe, expect, it } from "vitest";
import { emailConfigFromEnv } from "./email-config";

describe("emailConfigFromEnv", () => {
  it("reads SMTP_URL and EMAIL_FROM", () => {
    expect(
      emailConfigFromEnv({ SMTP_URL: "smtps://u:p@smtp.example.com:465", EMAIL_FROM: "Gymple <hi@gymple.com>" }),
    ).toEqual({ smtpUrl: "smtps://u:p@smtp.example.com:465", from: "Gymple <hi@gymple.com>" });
  });

  it("defaults to the local Mailpit outside production", () => {
    expect(emailConfigFromEnv({ NODE_ENV: "development", SMTP_URL: " " })).toEqual({
      smtpUrl: "smtp://localhost:1025",
      from: "Gymple <no-reply@gymple.local>",
    });
  });

  it.each(["SMTP_URL", "EMAIL_FROM"])("requires %s in production", (name) => {
    const env: Record<string, string> = {
      NODE_ENV: "production",
      SMTP_URL: "smtp://smtp.example.com:587",
      EMAIL_FROM: "hi@gymple.com",
    };
    delete env[name];
    expect(() => emailConfigFromEnv(env)).toThrow(new RegExp(`${name} is not set`));
  });

  it("rejects an SMTP_URL that is not smtp:// or smtps://", () => {
    expect(() => emailConfigFromEnv({ SMTP_URL: "http://example.com" })).toThrow(/SMTP_URL/);
  });
});
