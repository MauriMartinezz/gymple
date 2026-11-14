import { describe, expect, it } from "vitest";
import { INVITE_CODE_LENGTH, newInviteCode, parseInviteCode } from "./invite-code";

describe("newInviteCode", () => {
  it("encodes 16 random bytes as 32 lowercase hex characters", () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i * 17);
    const code = newInviteCode((size) => bytes.slice(0, size));

    expect(code).toBe("00112233445566778899aabbccddeeff");
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
  });

  it("uses a secure random source by default, so codes differ", () => {
    const codes = new Set(Array.from({ length: 50 }, () => newInviteCode()));

    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("parseInviteCode", () => {
  it("accepts a well-formed code unchanged", () => {
    expect(parseInviteCode("00112233445566778899aabbccddeeff")).toBe("00112233445566778899aabbccddeeff");
  });

  it.each([
    undefined,
    null,
    42,
    "",
    "00112233445566778899AABBCCDDEEFF",
    " 00112233445566778899aabbccddeeff",
    "00112233445566778899aabbccddeeff ",
    "00112233445566778899aabbccddeef",
    "00112233445566778899aabbccddeeff0",
    "00112233445566778899aabbccddeegg",
    "../../admin",
  ])("rejects %j", (raw) => {
    expect(parseInviteCode(raw)).toBeNull();
  });
});
