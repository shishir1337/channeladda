"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser-side auth. Talks to the handler at /api/auth, so no base URL is
 * needed while the app is served from a single origin.
 *
 * Methods are reached through the client rather than destructured: it is a
 * proxy that builds calls from endpoint paths, so pulling names off it hides
 * typos until runtime.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
