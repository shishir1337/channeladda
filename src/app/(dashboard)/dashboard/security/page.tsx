import {
  ArrowRightIcon,
  KeyIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TimerIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { PageHead, Section } from "@/components/dashboard/page-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Security",
  robots: { index: false, follow: false },
};

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

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
      <PageHead
        title="Security"
        description="Two things stand between a stolen password and your money: a second step when you sign in, and a 24-hour hold on withdrawals whenever your payout address changes."
      />

      {privileged && !twoFactorEnabled ? (
        <Section>
          <div className="flex flex-col gap-4 rounded-panel border border-danger/30 bg-danger-soft p-5 sm:flex-row sm:items-center sm:p-6">
            <ShieldAlertIcon
              aria-hidden="true"
              className="size-7 shrink-0 text-danger"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-bold text-fg">
                Two-step is expected on this account
              </h2>
              {/* biome-ignore lint/a11y/useSemanticElements: an <output> is the
                  result of a form. This is a standing warning about the account
                  that happens to want announcing, which is what role=status is
                  for — and it is the role this page has always carried. */}
              <p
                role="status"
                className="mt-1 text-sm leading-relaxed text-muted"
              >
                Your account can move money or take custody of other
                people&rsquo;s channels. A stolen password here is not the same
                kind of problem as a stolen password on a buyer&rsquo;s account.
              </p>
            </div>
            <Button asChild size="sm" className="shrink-0">
              <Link href="#two-step">Turn it on</Link>
            </Button>
          </div>
        </Section>
      ) : null}

      {/* ---- where this account stands ----------------------------------- */}
      <Section title="Where this account stands">
        <ul className="overflow-hidden rounded-panel border border-line bg-surface">
          <StatusRow
            icon={SmartphoneIcon}
            label="Two-step sign-in"
            good={twoFactorEnabled}
            state={twoFactorEnabled ? "On" : "Off"}
            body={
              twoFactorEnabled
                ? "Signing in asks for a code from your authenticator app, so your password alone is not enough."
                : "Your password is the only thing protecting this account right now. A code from your phone takes two minutes to set up."
            }
            action={
              twoFactorEnabled ? null : (
                <Button asChild size="sm" variant="secondary">
                  <Link href="#two-step">Set it up</Link>
                </Button>
              )
            }
          />
          <StatusRow
            icon={KeyIcon}
            label="How you sign in"
            good
            state={account !== null ? "Password" : "Google"}
            body={
              account !== null
                ? "With an email address and a password. Use one you have used nowhere else."
                : "With your Google account, so there is no Channel Adda password to steal. Two-step on your Google account protects this one too."
            }
          />
          <StatusRow
            icon={TimerIcon}
            label="24-hour hold on payout changes"
            good
            state="Always on"
            body="Whenever your payout address changes, withdrawals are held for a day. Taking over an account and re-pointing the payout address is how sellers actually lose money, and the delay is the whole defence."
          />
        </ul>
      </Section>

      {/* ---- the control itself ------------------------------------------ */}
      <Section>
        <div id="two-step" className="scroll-mt-24">
          <TwoFactorSetup
            enabled={twoFactorEnabled}
            hasPassword={account !== null}
          />
        </div>
      </Section>

      {/* ---- money safety ------------------------------------------------ */}
      <Section title="Your money">
        <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 sm:flex-row sm:items-center sm:p-6">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary-text"
          >
            <WalletIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold text-fg">
              Your payout address lives in the wallet
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Before you change it, two things worth knowing: withdrawals are
              held for 24 hours after a change, and a payout sent to a wrong
              address cannot be recovered by us or by anybody else. Check it
              against your own wallet, character by character.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link href="/dashboard/wallet">
              Open wallet
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      </Section>

      {/* ---- what we will never do --------------------------------------- */}
      <Section title="What Channel Adda will never ask you for">
        <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
          <ul className="flex flex-col gap-3">
            {[
              "Your password — not by email, not in chat, not on the phone.",
              "A code from your authenticator app.",
              "One of your backup codes.",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm leading-relaxed text-muted"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
                >
                  <XIcon className="size-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2.5 border-t border-line pt-4 text-sm leading-relaxed text-fg">
            <ShieldCheckIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-verified"
            />
            <span>
              Anybody who asks for one of those is trying to take your account —
              including if they appear to be us.
            </span>
          </p>
        </div>
      </Section>
    </>
  );
}

/** One line of the account's standing: what it is, where it stands, why. */
function StatusRow({
  icon: Icon,
  label,
  state,
  good,
  body,
  action,
}: {
  icon: Icon;
  label: string;
  state: string;
  good: boolean;
  body: string;
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 border-t border-line p-4 first:border-t-0 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
      <span
        aria-hidden="true"
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
          good
            ? "bg-verified-soft text-verified"
            : "bg-primary-soft text-primary-text"
        }`}
      >
        <Icon className="size-[1.1rem]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-sm font-semibold text-fg">{label}</h3>
          <Badge variant={good ? "verified" : "primary"}>{state}</Badge>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
      </div>
      {action ? <div className="shrink-0 sm:pt-0.5">{action}</div> : null}
    </li>
  );
}
