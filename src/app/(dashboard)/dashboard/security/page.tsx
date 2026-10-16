import type { Metadata } from "next";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { db } from "@/lib/db";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Security",
  robots: { index: false, follow: false },
};

/**
 * Account security.
 *
 * Staff and agents are told plainly that two-step is expected of them rather
 * than merely offered: between them they can move other people's money and
 * take ownership of other people's channels, and a stolen password on one of
 * those accounts is a different kind of incident from a stolen password on a
 * buyer's.
 */
export default async function SecurityPage() {
  const user = await requireUser("/dashboard/security");

  const [account, twoFactorEnabled] = await Promise.all([
    db.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { id: true },
    }),
    db.user
      .findUnique({
        where: { id: user.id },
        select: { twoFactorEnabled: true },
      })
      .then((row) => row?.twoFactorEnabled ?? false),
  ]);

  const privileged = user.role !== "USER";

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Account
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        Security
      </h1>

      {privileged && !twoFactorEnabled ? (
        <p
          role="status"
          className="mt-5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-relaxed text-fg"
        >
          Your account can move money or take custody of other people's
          channels. Turn two-step on — a stolen password on this account is not
          the same kind of problem as a stolen password on a buyer's.
        </p>
      ) : null}

      <div className="mt-6">
        <TwoFactorSetup
          enabled={twoFactorEnabled}
          hasPassword={account !== null}
        />
      </div>

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-subtle">
        Channel Adda never asks for your code by email, chat or phone. Anybody
        who does is trying to take your account, including if they appear to be
        us.
      </p>
    </>
  );
}
