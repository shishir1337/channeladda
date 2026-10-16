"use client";

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Browser-side auth. Talks to the handler at /api/auth, so no base URL is
 * needed while the app is served from a single origin.
 *
 * Methods are reached through the client rather than destructured: it is a
 * proxy that builds calls from endpoint paths, so pulling names off it hides
 * typos until runtime.
 */
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      // Where someone lands when their password was right and a second factor
      // is still owed. Without this the sign-in call resolves looking like a
      // success and the session is not actually usable.
      onTwoFactorRedirect() {
        window.location.href = "/signin/two-factor";
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
export const { twoFactor } = authClient;
