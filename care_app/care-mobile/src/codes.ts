/**
 * Pairing-code helpers. Pure — no Firebase — so they are fully unit-tested.
 *
 * A code is 6 characters from an unambiguous alphabet (no 0/O/1/I/L) so a
 * patient or a caregiver can read it aloud and type it without confusion.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Uppercases and strips spaces/dashes before checking — what a person types. */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidCode(input: string): boolean {
  return CODE_RE.test(normaliseCode(input));
}

/** Groups a code as "ABC-123" for display; never store the dash. */
export function formatCode(code: string): string {
  const c = normaliseCode(code);
  return c.length === CODE_LENGTH ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
}

export const CODE_TTL_DAYS = 30;

export function codeExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function isExpired(expiresAt: Date | string | number, now: number = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now;
}
