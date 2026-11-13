"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../infrastructure/better-auth";

// Sign-in lives in login-form.tsx and goes through the HTTP API, where the
// rate limiter runs. Do not add a sign-in server action here.

export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
