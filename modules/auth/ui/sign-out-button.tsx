import { signOut } from "./actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="h-9 rounded-md px-3 text-sm font-medium text-fg-muted transition-colors duration-(--duration-fast) hover:bg-surface-sunken hover:text-fg"
      >
        Sign out
      </button>
    </form>
  );
}
