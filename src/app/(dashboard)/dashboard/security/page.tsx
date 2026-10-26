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
import { InfoTip } from "@/components/app/info-tip";
import {
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  IconTile,
  PageHeader,
  Ring,
} from "@/components/app/kit";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { SignInDetails } from "@/components/dashboard/account-sign-in";
import { MyDeskIdentity } from "@/components/deals/my-desk-identity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isGoogleEnabled } from "@/lib/auth";
import { isCustodianRole } from "@/lib/custody-roles";
import { db } from "@/lib/db";
import { emailVerificationRequired } from "@/lib/email-verification";
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

  const [account, me] = await Promise.all([
    db.account.findFirst({
      // With a password in it: the same test the password and email forms
      // apply on the server (`@/server/account-security`).
      where: {
        userId: user.id,
        providerId: "credential",
        password: { not: null },
      },
      select: { id: true },
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: {
        // From the row, not the session: the session cookie can hold the
        // old address for a minute after it changes.
        email: true,
        twoFactorEnabled: true,
        agentEmail: true,
        agentTelegram: true,
        agentFacebook: true,
        agentBrand: true,
        dealLevel: true,
      },
    }),
  ]);
  const twoFactorEnabled = me?.twoFactorEnabled ?? false;
  // Agents, moderators and the superadmin run deals and keep their own
  // access email here rather than asking the superadmin to change it.
  const runsDeals = isCustodianRole(user.role);

  const privileged = user.role !== "USER";

  /**
   * Where the account stands, one row each: a name and a badge on the page,
   * the why behind each row's (i). Kept as data so the ring above the rows
   * counts exactly the badges it summarises.
   */
  const standing: StatusRowProps[] = [
    {
      id: "two-step",
      icon: SmartphoneIcon,
      label: "Two-step sign-in",
      good: twoFactorEnabled,
      state: twoFactorEnabled ? "On" : "Off",
      body: twoFactorEnabled
        ? "Signing in asks for a code from your authenticator app, so your password alone is not enough."
        : "Your password is the only thing protecting this account right now. A code from your phone takes two minutes to set up.",
      action: twoFactorEnabled ? null : (
        <Button asChild size="sm" variant="secondary">
          <Link href="#two-step">Set it up</Link>
        </Button>
      ),
    },
    {
      id: "sign-in",
      icon: KeyIcon,
      label: "How you sign in",
      good: true,
      state: account !== null ? "Password" : "Google",
      body:
        account !== null
          ? "With an email address and a password. Use one you have used nowhere else."
          : "With your Google account, so there is no Channel Adda password to steal. Two-step on your Google account protects this one too.",
    },
    {
      id: "payout-hold",
      icon: TimerIcon,
      label: "24-hour hold on payout changes",
      good: true,
      state: "Always on",
      body: "Whenever your payout address changes, withdrawals are held for a day. Taking over an account and re-pointing the payout address is how sellers actually lose money, and the delay is the whole defence.",
    },
  ];
  const good = standing.filter((row) => row.good).length;

  return (
    <>
      <PageHeader
        title="Security"
        description="Your email, password and two-step sign-in."
        info="Two-step sign-in and a 24-hour payout hold stand between a stolen password and your money."
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
            as="h2"
            icon={ShieldCheckIcon}
            title="Where this account stands"
            actions={
              <Ring
                value={good}
                max={standing.length}
                label={`${good} of ${standing.length} in good standing`}
                tone={good === standing.length ? "verified" : "primary"}
                size={32}
              >
                {good}/{standing.length}
              </Ring>
            }
          />
          <ul className="divide-y divide-line">
            {standing.map((row) => (
              <StatusRow key={row.id} {...row} />
            ))}
          </ul>
        </Card>

        {/* ---- email and password ---------------------------------------- */}
        <SignInDetails
          email={me?.email ?? user.email}
          hasPassword={account !== null}
          confirmByCode={emailVerificationRequired()}
          googleEnabled={isGoogleEnabled()}
        />

        {/* ---- the control itself ---------------------------------------- */}
        <div id="two-step" className="scroll-mt-24">
          <TwoFactorSetup
            enabled={twoFactorEnabled}
            hasPassword={account !== null}
          />
        </div>

        {runsDeals ? (
          <div id="deal-desk" className="scroll-mt-24">
            <MyDeskIdentity
              email={me?.agentEmail ?? null}
              telegram={me?.agentTelegram ?? null}
              facebook={me?.agentFacebook ?? null}
              brand={me?.agentBrand ?? null}
              level={me?.dealLevel ?? null}
            />
          </div>
        ) : null}

        {/* ---- money safety ---------------------------------------------- */}
        <Card>
          <CardHeader
            as="h2"
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
            as="h2"
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

type StatusRowProps = {
  id: string;
  icon: Icon;
  label: string;
  state: string;
  good: boolean;
  body: string;
  action?: ReactNode;
};

/**
 * One line of the account's standing: what it is and where it stands. When
 * it is fine the why sits behind the (i); when it is not, the why is the
 * warning, so it is in sight.
 */
function StatusRow({ icon, label, state, good, body, action }: StatusRowProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <IconTile icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="min-w-0 text-sm leading-5 font-medium text-fg">
            {label}
          </h3>
          {good ? <InfoTip label={`About ${label}`}>{body}</InfoTip> : null}
        </div>
        {good ? null : (
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            {body}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge size="sm" variant={good ? "verified" : "primary"}>
          {state}
        </Badge>
        {action}
      </div>
    </li>
  );
}
