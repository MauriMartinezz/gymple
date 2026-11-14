/*
 * Where to send the user after signing in (`?next=`). Only same-origin,
 * relative paths are accepted, so the parameter cannot be used as an open
 * redirect. We check it ourselves: better-auth's origin checks do not cover
 * client-side navigation, and are disabled in tests.
 */

const PLACEHOLDER_ORIGIN = "http://return-path.invalid";

export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  // "//host" and "/\host" are protocol-relative to browsers; control characters are stripped by URL parsers.
  if (raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f\s]/.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginHref(next: unknown): string {
  return withNext("/login", next);
}

export function signUpHref(next: unknown): string {
  return withNext("/signup", next);
}

function withNext(path: string, next: unknown): string {
  const safe = safeReturnPath(next);
  return safe ? `${path}?${new URLSearchParams({ next: safe })}` : path;
}
