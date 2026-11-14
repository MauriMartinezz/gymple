import { describe, expect, it } from "vitest";
import { parseSignUpInput } from "./sign-up-input";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseSignUpInput", () => {
  it("trims the name and email", () => {
    expect(parseSignUpInput(form({ name: "  Ana ", email: " ana@example.com ", password: "secret123" }))).toEqual({
      ok: true,
      value: { name: "Ana", email: "ana@example.com", password: "secret123" },
    });
  });

  it("reports every missing or invalid field", () => {
    expect(parseSignUpInput(form({ name: " ", email: "nope", password: "short" }))).toEqual({
      ok: false,
      errors: {
        name: "Enter your name.",
        email: "Enter a valid email address.",
        password: "Password must be at least 8 characters.",
      },
    });
  });

  it("rejects a name longer than 100 characters", () => {
    const result = parseSignUpInput(form({ name: "a".repeat(101), email: "a@b.co", password: "secret123" }));
    expect(result).toEqual({ ok: false, errors: { name: "Name must be at most 100 characters." } });
  });
});
