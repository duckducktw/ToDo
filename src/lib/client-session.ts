"use client";

import { signOut } from "next-auth/react";

let pendingSignOut: Promise<unknown> | null = null;

export function signOutInvalidSession(): Promise<unknown> {
  if (!pendingSignOut) {
    pendingSignOut = signOut({ redirectTo: "/login" }).finally(() => {
      pendingSignOut = null;
    });
  }

  return pendingSignOut;
}

export async function handleUnauthorizedResponse(
  response: Response,
): Promise<boolean> {
  if (response.status !== 401 || typeof window === "undefined") return false;

  await signOutInvalidSession();
  return true;
}
