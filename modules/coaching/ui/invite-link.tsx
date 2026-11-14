"use client";

import { useState, useSyncExternalStore } from "react";
import { buttonClass, inputClass } from "@/shared/ui/styles";

const noSubscription = () => () => {};

/** The trainer's profile link, as a full URL on this site, with a copy button. */
export function InviteLink({ path }: { path: string }) {
  // The origin is only known in the browser; the server renders the path.
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = `${origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor="invite-link" className="sr-only">
        Your invite link
      </label>
      <input id="invite-link" readOnly value={url} className={`${inputClass} font-mono text-sm`} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" onClick={copy} className={buttonClass("secondary")}>
        {copied ? "Copied" : "Copy link"}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );
}
