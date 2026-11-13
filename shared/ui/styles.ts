/** Shared class names for form controls and buttons, built on the design tokens. */

export const inputClass =
  "h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-fg " +
  "placeholder:text-fg-subtle transition-colors duration-(--duration-fast) " +
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 " +
  "aria-invalid:border-danger";

export const textareaClass = inputClass.replace("h-11", "min-h-24 py-2");

export const labelClass = "text-sm font-medium text-fg";

export const fieldErrorClass = "text-sm text-danger";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold " +
  "transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-60";

const buttonVariants = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active",
  secondary: "border border-border-strong bg-surface text-fg hover:bg-surface-sunken",
  ghost: "text-fg-muted hover:bg-surface-sunken hover:text-fg",
  /** Confirms a destructive action. */
  danger: "border border-danger bg-danger-subtle text-on-danger-subtle hover:bg-danger hover:text-on-primary",
} as const;

const buttonSizes = {
  md: "h-11 px-4 text-base",
  sm: "h-9 px-3 text-sm",
} as const;

export function buttonClass(
  variant: keyof typeof buttonVariants = "primary",
  size: keyof typeof buttonSizes = "md",
): string {
  return `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]}`;
}
