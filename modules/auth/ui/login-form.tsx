"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { error: null, email: "" };

const inputClass =
  "h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-fg " +
  "placeholder:text-fg-subtle transition-colors duration-(--duration-fast) " +
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 " +
  "aria-invalid:border-danger";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const hasError = Boolean(state.error);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
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
          defaultValue={state.email}
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
          {state.error}
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
