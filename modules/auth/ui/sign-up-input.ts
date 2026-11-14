export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export type SignUpErrors = Partial<Record<keyof SignUpInput, string>>;

export type SignUpParseResult = { ok: true; value: SignUpInput } | { ok: false; errors: SignUpErrors };

// Mirrors better-auth's defaults (8–128 characters), so users see the rule
// before the request.
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;
const MAX_NAME = 100;

export function parseSignUpInput(form: FormData): SignUpParseResult {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const errors: SignUpErrors = {};

  if (!name) errors.name = "Enter your name.";
  else if (name.length > MAX_NAME) errors.name = `Name must be at most ${MAX_NAME} characters.`;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";

  if (password.length < MIN_PASSWORD) errors.password = `Password must be at least ${MIN_PASSWORD} characters.`;
  else if (password.length > MAX_PASSWORD) errors.password = `Password must be at most ${MAX_PASSWORD} characters.`;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { name, email, password } };
}
