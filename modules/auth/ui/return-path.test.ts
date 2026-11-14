import { describe, expect, it } from "vitest";
import { loginHref, safeReturnPath, signUpHref } from "./return-path";

describe("safeReturnPath", () => {
  it.each([
    ["/join/00112233445566778899aabbccddeeff", "/join/00112233445566778899aabbccddeeff"],
    ["/sessions?tab=1#top", "/sessions?tab=1#top"],
    ["/", "/"],
  ])("accepts the same-origin path %j", (raw, expected) => {
    expect(safeReturnPath(raw)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    "",
    "join/abc",
    "//evil.example/join",
    "/\\evil.example",
    "\\\\evil.example",
    "/\\/evil.example",
    "https://evil.example/join",
    "javascript:alert(1)",
    " /join/abc",
    "/join/abc\n",
    "/\t/evil.example",
    // Dot segments resolve to a protocol-relative "//evil.example".
    "/.//evil.example",
    "/..//evil.example",
    "/%2e//evil.example",
    "/%2e%2e//evil.example",
    "/a/..//evil.example",
    // A repeated query parameter is not a return path.
    ["/join/abc", "/other"],
  ])("rejects %j", (raw) => {
    expect(safeReturnPath(raw)).toBeNull();
  });
});

describe("loginHref and signUpHref", () => {
  it("carry a safe return path", () => {
    expect(loginHref("/join/abc")).toBe("/login?next=%2Fjoin%2Fabc");
    expect(signUpHref("/join/abc")).toBe("/signup?next=%2Fjoin%2Fabc");
  });

  it("drop an unsafe or missing one", () => {
    expect(loginHref("//evil.example")).toBe("/login");
    expect(signUpHref(null)).toBe("/signup");
  });
});
