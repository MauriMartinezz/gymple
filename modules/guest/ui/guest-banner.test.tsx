import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { GuestBanner } = await import("./guest-banner");

describe("GuestBanner", () => {
  it("says where the data lives, links to sign-up and says the data can be imported (S13, S14)", () => {
    const html = renderToStaticMarkup(<GuestBanner />);

    expect(html).toContain('role="note"');
    expect(html).toContain("Guest mode: your data is saved only in this browser.");
    expect(html).toContain('<a href="/signup" class="font-semibold underline">Create an account</a>');
    expect(html).toContain("and you can import it.");
  });
});
