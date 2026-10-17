import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormNotice } from "@/components/auth/fields";
import { AcceptInviteForm } from "@/components/auth/invite-form";
import {
  MIN_STAFF_PASSWORD,
  peekStaffInvite,
  ROLE_BLURBS,
  ROLE_LABELS,
} from "@/server/admin-users";

/**
 * Accepting an invitation onto the team.
 *
 * Public, and has to be: the person opening it has no account yet — that is
 * what they are here to create. The token in the link is the authorisation,
 * and it can only ever produce the one address and the one role a superadmin
 * already wrote down.
 *
 * Deliberately not indexed, and deliberately not told apart from a dead link:
 * expired, withdrawn and already-used all render the same sentence, so this
 * page cannot be used to find out whether a guessed token means anything.
 */
export const metadata: Metadata = {
  title: "Join the team",
  robots: { index: false, follow: false },
};

/**
 * Props spelled out rather than taken from `PageProps<"/invite">`.
 *
 * That helper reads `.next/types/routes.d.ts`, which only exists once `next
 * dev` or `next build` has seen this file — so a fresh checkout, or a
 * typecheck run before the dev server has picked the route up, fails on a
 * route that is perfectly fine. This is the same shape Next passes.
 */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  const raw = typeof token === "string" ? token : "";
  const invite = raw ? await peekStaffInvite(raw) : null;

  if (!invite) {
    return (
      <AuthShell
        title="This invitation cannot be used"
        description="It may have expired, been withdrawn, or already been accepted."
        footer={
          <p>
            Already have an account?{" "}
            <Link
              href="/signin"
              className="font-medium text-primary-text underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        }
      >
        <FormNotice>
          Ask whoever invited you to send a new link. An invitation works once
          and lasts 72 hours, so a second copy of one you have already used will
          not work either.
        </FormNotice>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Join the team"
      description={
        <>
          You have been invited to Channel Adda as{" "}
          <strong className="font-semibold text-fg">
            {ROLE_LABELS[invite.role].toLowerCase()}
          </strong>{" "}
          — {ROLE_BLURBS[invite.role].toLowerCase()} Choose a password and the
          account is yours. Nobody else will ever know it.
        </>
      }
      footer={
        <p>
          Not expecting this? Close the tab and tell whoever sent it — the link
          can be withdrawn.
        </p>
      }
    >
      <AcceptInviteForm
        token={raw}
        email={invite.email}
        roleLabel={ROLE_LABELS[invite.role]}
        minPassword={MIN_STAFF_PASSWORD}
      />
    </AuthShell>
  );
}
