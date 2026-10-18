import {
  ArrowRightIcon,
  BanIcon,
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
import {
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  IconTile,
  PageHeader,
} from "@/components/app/kit";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
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
      <PageHeader
        title="Security"
        description="Two-step sign-in and a 24-hour payout hold stand between a stolen password and your money."
      />

      {privileged && !twoFactorEnabled ? (
        <Callout
          tone="danger"
          icon={ShieldAlertIcon}
          title="Two-step is expected on this account"
          action={
            // Secondary: it only scrolls to the card below, whose button is
            // the one gold control on the page.
            <Button asChild size="sm" variant="secondary">
              <Link href="#two-step">Turn it on</Link>
            </Button>
          }
          className="mb-5"
        >
          {/* role=status, not <output>: an <output> is the result of a
              form, and this is a standing warning about the account. */}
          <p role="status">
            Your account can move money or take custody of other people&rsquo;s
            channels. A stolen password here is not the same kind of problem as
            a stolen password on a buyer&rsquo;s account.
          </p>
        </Callout>
      ) : null}

      {/* Settings, one card each: what it is on top, the control below. */}
      <div className="flex flex-col gap-5">
        {/* ---- where this account stands --------------------------------- */}
        <Card>
          <CardHeader
            icon={ShieldCheckIcon}
            title="Where this account stands"
          />
          <ul className="divide-y divide-line">
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
        </Card>

        {/* ---- the control itself ---------------------------------------- */}
        <div id="two-step" className="scroll-mt-24">
          <TwoFactorSetup
            enabled={twoFactorEnabled}
            hasPassword={account !== null}
          />
        </div>

        {/* ---- money safety ---------------------------------------------- */}
        <Card>
          <CardHeader
            icon={WalletIcon}
            title="Your payout address lives in the wallet"
            actions={
              <Button asChild variant="secondary" size="sm">
                <Link href="/dashboard/wallet">
                  Open wallet
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
            }
          />
          <CardBody>
            <p className="max-w-[72ch] text-sm leading-relaxed text-muted">
              Before you change it, two things worth knowing: withdrawals are
              held for 24 hours after a change, and a payout sent to a wrong
              address cannot be recovered by us or by anybody else. Check it
              against your own wallet, character by character.
            </p>
          </CardBody>
        </Card>

        {/* ---- what we will never do ------------------------------------- */}
        <Card>
          <CardHeader
            icon={BanIcon}
            title="What Channel Adda will never ask you for"
          />
          <CardBody>
            <ul className="flex flex-col gap-2.5">
              {[
                "Your password — not by email, not in chat, not on the phone.",
                "A code from your authenticator app.",
                "One of your backup codes.",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-sm leading-relaxed text-fg"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger ring-1 ring-danger/20 ring-inset"
                  >
                    <XIcon className="size-3" strokeWidth={2.5} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </CardBody>
          <CardFooter className="flex items-start gap-2.5 text-fg">
            <ShieldCheckIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-verified"
            />
            <span>
              Anybody who asks for one of those is trying to take your account —
              including if they appear to be us.
            </span>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}

/** One line of the account's standing: what it is, where it stands, why. */
function StatusRow({
  icon,
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
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconTile icon={icon} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm leading-6 font-medium text-fg">{label}</h4>
            <Badge size="sm" variant={good ? "verified" : "primary"}>
              {state}
            </Badge>
          </div>
          <p className="mt-0.5 max-w-[72ch] text-[0.8125rem] leading-relaxed text-muted">
            {body}
          </p>
        </div>
      </div>
      {action ? (
        <div className="shrink-0 pl-11 sm:pt-0.5 sm:pl-0">{action}</div>
      ) : null}
    </li>
  );
}
