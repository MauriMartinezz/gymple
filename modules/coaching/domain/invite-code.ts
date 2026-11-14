/**
 * A trainer's profile link is `/join/<code>` (S11). The code is 16 bytes from
 * a cryptographically secure source, written as lowercase hex: unguessable,
 * and safe to compare exactly whatever the database collation.
 */
export const INVITE_CODE_BYTES = 16;
export const INVITE_CODE_LENGTH = INVITE_CODE_BYTES * 2;

const INVITE_CODE_PATTERN = /^[0-9a-f]{32}$/;

export type RandomBytes = (size: number) => Uint8Array;

const secureRandomBytes: RandomBytes = (size) => crypto.getRandomValues(new Uint8Array(size));

export function newInviteCode(randomBytes: RandomBytes = secureRandomBytes): string {
  return Array.from(randomBytes(INVITE_CODE_BYTES), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The code exactly as issued, or null: no trimming, no case folding. */
export function parseInviteCode(raw: unknown): string | null {
  return typeof raw === "string" && INVITE_CODE_PATTERN.test(raw) ? raw : null;
}
