import { fieldErrorClass, inputClass, labelClass } from "@/shared/ui/styles";

export function FormField({
  name,
  label,
  defaultValue,
  error,
  hint,
  type = "text",
  maxLength,
  inputMode,
  autoComplete = "off",
}: {
  name: string;
  label: string;
  defaultValue: string;
  error?: string;
  hint?: string;
  type?: string;
  maxLength?: number;
  inputMode?: "numeric" | "email" | "text";
  autoComplete?: string;
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
        required
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
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

export const formAlertClass = "rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle";

/** DNI input allows dots and spaces, which the domain strips. */
export const DNI_INPUT_MAX = 12;
export const DNI_HINT = "7 or 8 digits. Dots and spaces are ignored.";
