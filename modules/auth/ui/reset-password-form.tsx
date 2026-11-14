"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { buttonClass, fieldErrorClass, inputClass, labelClass } from "@/shared/ui/styles";
import { RESET_PASSWORD_PATH } from "../application/set-password-email";
import { authClient } from "./auth-client";
import { resetPasswordErrorMessage } from "./auth-error-message";
import { MAX_PASSWORD, MIN_PASSWORD } from "./sign-up-input";

const alertClass = "rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle";

/**
 * Chooses a new password with the token from the emailed link. Used by
 * trainers the admin created (first password) and by "forgot your password".
 * Goes through the HTTP API so better-auth's rate limiter applies.
 */
export function ChoosePasswordForm({ token }: { token: string }) {
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get("password") ?? "");
    setError(null);
    if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
      setFieldError(`Password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`);
      return;
    }
    setFieldError(null);
    setPending(true);

    const { error: resetError } = await authClient.resetPassword({ newPassword, token });

    setPending(false);
    if (resetError) {
      setError(resetPasswordErrorMessage(resetError));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-3 text-center">
        <h2 className="text-lg font-semibold text-fg">Password saved</h2>
        <p className="text-sm text-fg-muted">Sign in with your email and your new password.</p>
        <Link href="/login" className={buttonClass("primary")}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={labelClass}>
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(fieldError) || undefined}
          aria-describedby={fieldError ? "password-error" : "password-hint"}
          className={inputClass}
        />
        {fieldError ? (
          <p id="password-error" className={fieldErrorClass}>
            {fieldError}
          </p>
        ) : (
          <p id="password-hint" className="text-sm text-fg-subtle">
            At least {MIN_PASSWORD} characters.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className={alertClass}>
          {error}{" "}
          <Link href={RESET_PASSWORD_PATH} className="font-medium underline">
            Get a new link
          </Link>
        </p>
      )}

      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

/** Emails a new link. The answer is the same whether or not the email has an account. */
export function RequestPasswordLinkForm({ linkRejected }: { linkRejected: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setError(null);
    setPending(true);

    const { error: requestError } = await authClient.requestPasswordReset({ email, redirectTo: RESET_PASSWORD_PATH });

    setPending(false);
    if (requestError) {
      setError(
        requestError.status === 400 ? "Enter a valid email address." : resetPasswordErrorMessage(requestError),
      );
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col gap-3 text-center">
        <h2 className="text-lg font-semibold text-fg">Check your email</h2>
        <p className="text-sm text-fg-muted">
          If an account uses <span className="font-medium text-fg">{sentTo}</span>, we&apos;ve sent it a link to
          choose a password.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {linkRejected && (
        <p role="alert" className={alertClass}>
          This link is not valid or has expired. Ask for a new one below.
        </p>
      )}
      <p className="text-sm text-fg-muted">Enter your email and we&apos;ll send you a link to choose a password.</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </div>

      {error && (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Sending…" : "Send link"}
      </button>
    </form>
  );
}
