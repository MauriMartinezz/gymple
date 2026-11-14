"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { buttonClass, fieldErrorClass, inputClass, labelClass } from "@/shared/ui/styles";
import { authClient } from "./auth-client";
import { signUpErrorMessage } from "./auth-error-message";
import { loginHref } from "./return-path";
import { parseSignUpInput, type SignUpErrors } from "./sign-up-input";

// Signs up through the HTTP API (not a server action) so Better Auth's rate
// limiter applies. No session is created: the user must verify the email first.
// `next` (e.g. a trainer's /join link) is carried to the sign-in link.
export function SignUpForm({ next = null }: { next?: string | null }) {
  const [fieldErrors, setFieldErrors] = useState<SignUpErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = parseSignUpInput(new FormData(event.currentTarget));
    setError(null);
    if (!input.ok) {
      setFieldErrors(input.errors);
      return;
    }
    setFieldErrors({});
    setPending(true);

    const { error: signUpError } = await authClient.signUp.email(input.value);

    setPending(false);
    if (signUpError) {
      setError(signUpErrorMessage(signUpError));
      return;
    }
    // Same answer for new and already registered emails: don't reveal which accounts exist.
    setSentTo(input.value.email);
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col gap-3 text-center">
        <h2 className="text-lg font-semibold text-fg">Check your email</h2>
        <p className="text-sm text-fg-muted">
          We&apos;ve sent a verification link to <span className="font-medium text-fg">{sentTo}</span>.
          Open it to activate your account, then sign in.
        </p>
        <Link href={loginHref(next)} className={buttonClass("secondary")}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <Field name="name" label="Name" autoComplete="name" error={fieldErrors.name} />
      <Field name="email" label="Email" type="email" autoComplete="email" error={fieldErrors.email} />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={fieldErrors.password}
      />

      {error && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  autoComplete,
  hint,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete: string;
  hint?: string;
  error?: string;
}) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={inputClass}
      />
      {error ? (
        <p id={`${name}-error`} className={fieldErrorClass}>
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${name}-hint`} className="text-sm text-fg-subtle">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
