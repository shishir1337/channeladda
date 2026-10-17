import { expect, test } from "vitest";
import { auth } from "@/lib/auth";
import { acceptStaffInvite, createStaffInvite } from "@/server/admin-users";
import { seedUser, withCleanDb } from "@/test/db";

test(
  "a staff member who accepted an invitation can sign in with their password",
  withCleanDb(async () => {
    // Accepting an invitation builds the password account by hand rather
    // than through sign-up, so it is the one place that has to match what
    // Better Auth looks an account up by. Nothing checked that it did, and
    // Better Auth changed that key between 1.7.1 and 1.7.10.
    const superadmin = await seedUser("SUPERADMIN");
    const invite = await createStaffInvite({
      actorId: superadmin.id,
      email: "new-agent@example.test",
      role: "AGENT",
    });
    if (!invite.ok) throw new Error(invite.reason);

    const accepted = await acceptStaffInvite({
      token: invite.token,
      name: "New Agent",
      password: "a-long-staff-password",
    });
    expect(accepted).toMatchObject({ ok: true });

    const signedIn = await auth.api.signInEmail({
      body: {
        email: "new-agent@example.test",
        password: "a-long-staff-password",
      },
    });
    expect(signedIn.user.email).toBe("new-agent@example.test");
  }),
);
