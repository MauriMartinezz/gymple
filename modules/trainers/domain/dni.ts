/**
 * Argentine national identity number. Only trainers have one (S8).
 * Stored as 7 or 8 ASCII digits; dots and spaces typed by the admin are dropped.
 */
export const DNI_MAX_LENGTH = 8;

export type DniResult = { ok: true; value: string } | { ok: false; error: string };

export function parseDni(raw: unknown): DniResult {
  const value = (typeof raw === "string" ? raw : "").replace(/[.\s]/g, "");
  if (!value) return { ok: false, error: "DNI is required." };
  if (!/^[0-9]{7,8}$/.test(value)) return { ok: false, error: "DNI must be 7 or 8 digits." };
  return { ok: true, value };
}
