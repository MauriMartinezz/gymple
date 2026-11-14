"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buttonClass, inputClass, labelClass } from "@/shared/ui/styles";
import { authClient } from "./auth-client";
import { signInErrorMessage } from "./auth-error-message";

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
      setError(signInErrorMessage(signInError, retryAfterSeconds));
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClass}>
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
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <Link href="/reset-password" className="text-sm font-medium text-primary hover:underline">
            Forgot your password?
          </Link>
        </div>
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
        className={buttonClass("primary")}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
