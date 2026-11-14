import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";

/*
 * The signed-in layout renders the guest import offer, which only appears in
 * the browser: the server markup must stay exactly what it was before (S14).
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/modules/auth/infrastructure/session", () => ({
  requireUser: async () => ({ id: 7, email: "alice@test.dev", name: "Alice" }),
  isCurrentUserAdmin: async () => false,
}));
vi.mock("@/modules/auth/ui/sign-out-button", () => ({ SignOutButton: () => <button type="button">Sign out</button> }));
vi.mock("@/modules/coaching/ui/coaching-service", () => ({ isCurrentUserActiveTrainer: async () => true }));
vi.mock("@/modules/guest-import/ui/actions", () => ({ importGuestDataAction: vi.fn() }));

const { default: AppLayout } = await import("@/app/(app)/layout");

async function html(node: React.ReactNode): Promise<string> {
  const { prelude } = await prerender(node);
  return new Response(prelude).text();
}

describe("signed-in layout", () => {
  it("renders the same server markup as before the import offer", async () => {
    const markup = await html(
      <AppLayout params={Promise.resolve({})}>
        <p>Page</p>
      </AppLayout>,
    );

    expect(markup).toContain("<p>Page</p>");
    expect(markup).toContain("alice@test.dev");
    expect(markup).not.toContain("Guest data import");
    expect(markup).toMatchSnapshot();
  });
});
