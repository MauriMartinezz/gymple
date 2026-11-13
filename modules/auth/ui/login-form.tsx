"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "./auth-client";

const inputClass =
  "h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-fg " +
  "placeholder:text-fg-subtle transition-colors duration-(--duration-fast) " +
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 " +
  "aria-invalid:border-danger";

// Signs in through the HTTP API (not a server action) so Better Auth's
// rate limiter applies: there is a single sign-in path to protect.
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const hasError = Boolean(error);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    let retryAfterSeconds: number | null = null;
    const { error: signInError } = await authClient.signIn.email(
      {
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      },
      {
        onError: ({ response }) => {
          if (response.status === 429) {
            retryAfterSeconds = Number(response.headers.get("X-Retry-After")) || null;
          }
        },
      },
    );

    if (signInError) {
      setPending(false);
      setError(errorMessage(signInError.status, retryAfterSeconds));
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-fg">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "login-error" : undefined}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-fg">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "login-error" : undefined}
          className={inputClass}
        />
      </div>

      {hasError && (
        <p
          id="login-error"
          role="alert"
          className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-primary px-4 text-base font-semibold text-on-primary transition-colors duration-(--duration-fast) hover:bg-primary-hover active:bg-primary-active disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function errorMessage(status: number, retryAfterSeconds: number | null): string {
  if (status === 429) {
    if (!retryAfterSeconds) return "Too many sign-in attempts. Please try again later.";
    const minutes = Math.ceil(retryAfterSeconds / 60);
    return `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  // Same message for unknown email and wrong password: don't reveal which accounts exist.
  if (status === 401) return "Invalid email or password.";
  return "Something went wrong. Please try again.";
}
