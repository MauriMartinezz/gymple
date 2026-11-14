import { describe, expect, it } from "vitest";
import { TRAINER_NAME_MAX, validateCertificationInput, validateTrainerInput } from "./trainer";

describe("validateTrainerInput", () => {
  it("accepts and normalizes name, email and DNI", () => {
    expect(
      validateTrainerInput({ name: "  Ana   Pérez ", email: "  Ana@Example.COM ", dni: "12.345.678" }),
    ).toEqual({ ok: true, value: { name: "Ana Pérez", email: "ana@example.com", dni: "12345678" } });
  });

  it("reports every invalid field at once", () => {
    expect(validateTrainerInput({ name: " ", email: "nope", dni: "123" })).toEqual({
      ok: false,
      errors: {
        name: "Name is required.",
        email: "Enter a valid email address.",
        dni: "DNI must be 7 or 8 digits.",
      },
    });
  });

  it("treats missing fields as empty", () => {
    expect(validateTrainerInput({})).toEqual({
      ok: false,
      errors: {
        name: "Name is required.",
        email: "Enter a valid email address.",
        dni: "DNI is required.",
      },
    });
  });

  it("limits the name length", () => {
    const result = validateTrainerInput({
      name: "x".repeat(TRAINER_NAME_MAX + 1),
      email: "ana@example.com",
      dni: "1234567",
    });
    expect(result).toEqual({
      ok: false,
      errors: { name: `Name must be at most ${TRAINER_NAME_MAX} characters.` },
    });
  });
});

describe("validateCertificationInput", () => {
  it("accepts and normalizes email and DNI", () => {
    expect(validateCertificationInput({ email: " Bo@Example.com", dni: "1 234 567" })).toEqual({
      ok: true,
      value: { email: "bo@example.com", dni: "1234567" },
    });
  });

  it("never asks for a name", () => {
    expect(validateCertificationInput({ email: "x", dni: "" })).toEqual({
      ok: false,
      errors: { email: "Enter a valid email address.", dni: "DNI is required." },
    });
  });
});
