import { describe, expect, it } from "vitest";
import { parseDni } from "./dni";

describe("parseDni", () => {
  it.each([
    ["1234567", "1234567"],
    ["12345678", "12345678"],
    ["12.345.678", "12345678"],
    ["1.234.567", "1234567"],
    [" 12 345 678 ", "12345678"],
    ["12. 345 .678", "12345678"],
  ])("accepts %j as %j", (raw, value) => {
    expect(parseDni(raw)).toEqual({ ok: true, value });
  });

  it.each([undefined, null, "", "   ", " . . "])("requires a DNI (%j)", (raw) => {
    expect(parseDni(raw)).toEqual({ ok: false, error: "DNI is required." });
  });

  it.each(["123456", "123456789", "12-345-678", "12,345,678", "1234567a", "１２３４５６７", "+1234567"])(
    "rejects %j",
    (raw) => {
      expect(parseDni(raw)).toEqual({ ok: false, error: "DNI must be 7 or 8 digits." });
    },
  );
});
