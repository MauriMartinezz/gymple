import type { ReactNode } from "react";

/** Centered card with the Gymple wordmark, shared by the auth pages. */
export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <p className="text-3xl font-bold tracking-tight text-fg">
          Gym<span className="text-primary">ple</span>
        </p>
        <h1 className="mt-2 text-base text-fg-muted">{title}</h1>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6 shadow-md">{children}</div>
      {footer && <p className="mt-6 text-center text-sm text-fg-muted">{footer}</p>}
    </div>
  );
}
