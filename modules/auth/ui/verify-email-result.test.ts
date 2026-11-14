import { describe, expect, it } from "vitest";
import { verifyEmailResult } from "./verify-email-result";

describe("verifyEmailResult", () => {
  it("is verified on better-auth's success redirect", () => {
    expect(verifyEmailResult({ status: "verified" })).toBe("verified");
  });

  it("reports an expired link", () => {
    expect(verifyEmailResult({ status: "verified", error: "TOKEN_EXPIRED" })).toBe("expired");
  });

  it.each(["INVALID_TOKEN", "USER_NOT_FOUND"])("reports %s as an invalid link", (error) => {
    expect(verifyEmailResult({ status: "verified", error })).toBe("invalid");
  });

  it("is pending without a result", () => {
    expect(verifyEmailResult({})).toBe("pending");
    expect(verifyEmailResult({ status: ["other"] })).toBe("pending");
  });
});
