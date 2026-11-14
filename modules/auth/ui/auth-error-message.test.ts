import { describe, expect, it } from "vitest";
import { resetPasswordErrorMessage, signInErrorMessage, signUpErrorMessage } from "./auth-error-message";

describe("signInErrorMessage", () => {
  it("tells unverified users to check their inbox", () => {
    expect(signInErrorMessage({ status: 403, code: "EMAIL_NOT_VERIFIED" }, null)).toBe(
      "Please verify your email first. We've sent you a new verification link.",
    );
  });

  it("keeps the generic message for wrong credentials", () => {
    expect(signInErrorMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }, null)).toBe(
      "Invalid email or password.",
    );
  });

  it("reports the rate limit wait", () => {
    expect(signInErrorMessage({ status: 429 }, 61)).toBe("Too many sign-in attempts. Try again in 2 minutes.");
    expect(signInErrorMessage({ status: 429 }, null)).toBe("Too many sign-in attempts. Please try again later.");
  });

  it("falls back to a generic message", () => {
    expect(signInErrorMessage({ status: 500 }, null)).toBe("Something went wrong. Please try again.");
  });
});

describe("signUpErrorMessage", () => {
  it.each([
    ["PASSWORD_TOO_SHORT", "Password must be at least 8 characters."],
    ["PASSWORD_TOO_LONG", "Password must be at most 128 characters."],
    ["INVALID_EMAIL", "Enter a valid email address."],
  ])("maps %s", (code, message) => {
    expect(signUpErrorMessage({ status: 400, code })).toBe(message);
  });

  it("reports the rate limit", () => {
    expect(signUpErrorMessage({ status: 429 })).toBe("Too many sign-up attempts. Please try again later.");
  });

  it("falls back to a generic message", () => {
    expect(signUpErrorMessage({ status: 500 })).toBe("Something went wrong. Please try again.");
  });
});

describe("resetPasswordErrorMessage", () => {
  it.each([
    ["INVALID_TOKEN", "This link is not valid or has expired. Ask for a new one below."],
    ["PASSWORD_TOO_SHORT", "Password must be at least 8 characters."],
    ["PASSWORD_TOO_LONG", "Password must be at most 128 characters."],
  ])("maps %s", (code, message) => {
    expect(resetPasswordErrorMessage({ status: 400, code })).toBe(message);
  });

  it("reports the rate limit", () => {
    expect(resetPasswordErrorMessage({ status: 429 })).toBe("Too many attempts. Please try again later.");
  });

  it("falls back to a generic message", () => {
    expect(resetPasswordErrorMessage({ status: 500 })).toBe("Something went wrong. Please try again.");
  });
});
