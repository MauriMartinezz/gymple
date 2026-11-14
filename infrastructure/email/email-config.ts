export interface EmailConfig {
  /** smtp:// or smtps:// URL, credentials included. */
  smtpUrl: string;
  /** Sender address, e.g. `Gymple <no-reply@example.com>`. */
  from: string;
}

// Outside production, emails go to the Mailpit container (docker-compose.yml).
const DEVELOPMENT_DEFAULTS: EmailConfig = {
  smtpUrl: "smtp://localhost:1025",
  from: "Gymple <no-reply@gymple.local>",
};

/**
 * Reads SMTP_URL and EMAIL_FROM. Both are required in production, so a
 * missing value never silently sends mail to a local catcher.
 */
export function emailConfigFromEnv(env: Record<string, string | undefined> = process.env): EmailConfig {
  const production = env.NODE_ENV === "production";
  const smtpUrl = value(env, "SMTP_URL", production) ?? DEVELOPMENT_DEFAULTS.smtpUrl;
  const from = value(env, "EMAIL_FROM", production) ?? DEVELOPMENT_DEFAULTS.from;

  if (!/^smtps?:\/\//.test(smtpUrl)) {
    throw new Error("SMTP_URL must start with smtp:// or smtps://.");
  }
  return { smtpUrl, from };
}

function value(env: Record<string, string | undefined>, name: string, required: boolean): string | undefined {
  const raw = env[name]?.trim();
  if (raw) return raw;
  if (required) throw new Error(`${name} is not set.`);
  return undefined;
}
