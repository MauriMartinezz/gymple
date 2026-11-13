import { describe, expect, it } from "vitest";
import { signInRateLimitFromEnv } from "./sign-in-rate-limit";

describe("signInRateLimitFromEnv", () => {
  it("defaults to 10 attempts per 15 minutes", () => {
    expect(signInRateLimitFromEnv({})).toEqual({ max: 10, window: 900 });
  });

  it("reads both values from the environment", () => {
    expect(
      signInRateLimitFromEnv({
        AUTH_SIGN_IN_MAX_ATTEMPTS: "5",
        AUTH_SIGN_IN_WINDOW_SECONDS: "60",
      }),
    ).toEqual({ max: 5, window: 60 });
  });

  it("treats empty values as unset", () => {
    expect(
      signInRateLimitFromEnv({ AUTH_SIGN_IN_MAX_ATTEMPTS: "", AUTH_SIGN_IN_WINDOW_SECONDS: " " }),
    ).toEqual({ max: 10, window: 900 });
  });

  it.each(["0", "-3", "2.5", "ten", "10abc"])(
    "rejects an invalid AUTH_SIGN_IN_MAX_ATTEMPTS: %s",
    (value) => {
      expect(() => signInRateLimitFromEnv({ AUTH_SIGN_IN_MAX_ATTEMPTS: value })).toThrow(
        /AUTH_SIGN_IN_MAX_ATTEMPTS/,
      );
    },
  );

  it.each(["0", "-1", "1.5", "abc"])("rejects an invalid AUTH_SIGN_IN_WINDOW_SECONDS: %s", (value) => {
    expect(() => signInRateLimitFromEnv({ AUTH_SIGN_IN_WINDOW_SECONDS: value })).toThrow(
      /AUTH_SIGN_IN_WINDOW_SECONDS/,
    );
  });
});
