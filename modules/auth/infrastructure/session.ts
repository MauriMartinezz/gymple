import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/infrastructure/db/client";
import type { CurrentUser } from "../domain/current-user";
import { auth } from "./better-auth";
import { DrizzleAdminFlags } from "./drizzle-admin-flags";

const adminFlags = new DrizzleAdminFlags(db);

/** The signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const { id, email, name } = session.user;
  return { id: Number(id), email, name };
});

/** The signed-in user; redirects to /login when there is none. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Whether the signed-in user is an admin, read from the database. Cached per request. */
export const isCurrentUserAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  return user ? adminFlags.isAdmin(user.id) : false;
});

/**
 * The signed-in admin. Redirects to /login without a session; any other user
 * gets the not-found page, so admin routes look like they do not exist.
 * Every admin page and admin action calls it first.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await adminFlags.isAdmin(user.id))) notFound();
  return user;
}
