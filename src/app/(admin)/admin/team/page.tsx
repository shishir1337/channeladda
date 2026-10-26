import {
  ClockIcon,
  KeyRoundIcon,
  MailIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InviteTeammate, RevokeInvite } from "@/components/admin/team-controls";
import { elapsed, ROLE_VARIANT } from "@/components/admin/vocab";
import {
  Callout,
  EmptyState,
  IconTile,
  List,
  ListItem,
  ListRow,
  MetaItem,
  Meter,
  PageHeader,
  Section,
  Sep,
  Stat,
  StatGrid,
  TableCard,
  Td,
  Th,
  Tr,
} from "@/components/app/kit";
import { Avatar } from "@/components/app/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
import type { UserRole } from "@/generated/prisma/enums";
import { capLoad, isCustodianRole, levelLabel } from "@/lib/custody-roles";
import { emailVerificationRequired } from "@/lib/email-verification";
import {
  IDENTITY_FIELDS,
  type IdentityField,
  type TransferIds,
} from "@/lib/transfer-identity";
import { cn } from "@/lib/utils";
import {
  INVITABLE_ROLES,
  listPendingInvites,
  listTeam,
  ROLE_BLURBS,
  ROLE_CONSEQUENCES,
  ROLE_LABELS,
} from "@/server/admin-users";
import { requireSuperadmin } from "@/server/session";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false, follow: false },
};

/**
 * Who has access, and what each of them is carrying.
 *
 * This page did not exist. "Who are my agents and which of them can take
 * another channel" was answerable only by paging through every account on the
 * platform and then opening each deal to count — so in practice it was not
 * answerable, and an agent silently at their cap looked exactly like a quiet
 * week.
 *
 * Superadmin-only, gated the same way `/admin/settings` is: it appoints staff
 * and hands out invitation links, which is the same power as setting fees.
 */

const DATE: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

const EXPIRES: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

/** On a staff account, "two-factor off" is a finding rather than a preference. */
function TwoFactor({ on }: { on: boolean }) {
  return on ? (
    <Badge variant="verified">
      <ShieldCheckIcon aria-hidden="true" />
      On
    </Badge>
  ) : (
    <Badge variant="danger">
      <KeyRoundIcon aria-hidden="true" />
      Off
    </Badge>
  );
}

/** The accounts on a member, as the transfer-identity rules read them. */
function identityOf(member: {
  agentEmail: string | null;
  agentTelegram: string | null;
  agentFacebook: string | null;
}): TransferIds {
  return {
    email: member.agentEmail,
    telegram: member.agentTelegram,
    facebook: member.agentFacebook,
  };
}

/** "Hands over to transfers@… · @ca_transfers · no Facebook account". */
function handsOverTo(member: {
  agentEmail: string | null;
  agentTelegram: string | null;
  agentFacebook: string | null;
  agentBrand: string | null;
}): string {
  const ids = identityOf(member);
  if (!member.agentBrand || IDENTITY_FIELDS.every(({ field }) => !ids[field])) {
    return "No transfer identity";
  }
  return IDENTITY_FIELDS.map(({ field }) => ids[field] ?? MISSING[field]).join(
    " · ",
  );
}

/** What a row in "Worth fixing" says is missing. */
function missingLine(member: {
  agentEmail: string | null;
  agentTelegram: string | null;
  agentFacebook: string | null;
  agentBrand: string | null;
}): string {
  const ids = identityOf(member);
  const gone = IDENTITY_FIELDS.filter(({ field }) => !ids[field]);
  if (!member.agentBrand || gone.length === IDENTITY_FIELDS.length) {
    return "Has no transfer identity";
  }
  return `Has ${gone.map(({ field }) => MISSING[field]).join(" and ")}`;
}

const MISSING: Readonly<Record<IdentityField, string>> = {
  email: "no email",
  telegram: "no Telegram username",
  facebook: "no Facebook account",
};

/**
 * An agent's load against the cap.
 *
 * The number that explains why Safest deals are not being picked up, which
 * nothing on the staff side said before. Not colour alone: at the cap it also
 * says so in words and gains a glyph.
 */
function Load({
  role,
  holds,
  cap,
}: {
  role: string;
  holds: number;
  cap: number;
}) {
  if (!isCustodianRole(role as UserRole)) {
    return (
      <span className="text-subtle">
        &mdash;<span className="sr-only">does not run deals</span>
      </span>
    );
  }

  // Over the limit is its own state: "11 of 10 · At cap" said the agent
  // was at it (QA).
  const load = capLoad(holds, cap);
  const atCap = load.state === "at" || load.state === "over";
  const nearCap = load.state === "near";

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-2.5">
        <Meter
          value={Math.min(holds, cap)}
          max={cap}
          label="Channels held against the cap"
          tone={atCap ? "danger" : nearCap ? "primary" : "neutral"}
          className="w-12"
        />
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            atCap ? "text-danger" : nearCap ? "text-primary-text" : "text-fg",
          )}
        >
          {load.state === "over" ? load.line : `${holds} of ${cap}`}
        </span>
      </span>
      {load.state === "at" ? (
        <Badge variant="danger">
          <TriangleAlertIcon aria-hidden="true" />
          At the limit
        </Badge>
      ) : nearCap ? (
        <Badge variant="primary">One left</Badge>
      ) : null}
    </span>
  );
}

export default async function AdminTeamPage() {
  const staff = await requireSuperadmin();
  const [{ members, maxHoldsPerAgent, activeSuperadmins }, invites] =
    await Promise.all([listTeam(), listPendingInvites()]);

  // Everyone who runs deals: agents, moderators and the superadmin.
  const agents = members.filter((member) => isCustodianRole(member.role));
  const atCap = agents.filter(
    (agent) => !agent.banned && agent.holds >= maxHoldsPerAgent,
  );
  const available = agents.filter(
    (agent) => !agent.banned && agent.holds < maxHoldsPerAgent,
  );
  // Missing any of the accounts sellers hand a deal to: those deals cannot
  // go to them.
  const noIdentity = agents.filter(
    (agent) =>
      !agent.banned &&
      (!agent.agentBrand ||
        IDENTITY_FIELDS.some(({ field }) => identityOf(agent)[field] === null)),
  );
  const noTwoFactor = members.filter(
    (member) => !member.twoFactorEnabled && !member.banned,
  );
  const live = invites.filter((invite) => !invite.expired);

  return (
    <>
      <PageHeader
        title="Team"
        info="Everyone who can reach the staff area, what they can do, and how many channels each agent holds against the cap."
        meta={
          <MetaItem label="Per-agent cap">
            {maxHoldsPerAgent.toLocaleString("en-US")} channels
          </MetaItem>
        }
        actions={
          <Button asChild variant="secondary">
            <Link href="#invite">
              <UserPlusIcon aria-hidden="true" />
              Invite a teammate
            </Link>
          </Button>
        }
      />

      {/* A platform with one superadmin is a platform one locked-out phone
          away from needing a developer and a database console. */}
      {activeSuperadmins < 2 ? (
        <Callout
          tone="danger"
          title="There is only one superadmin who can sign in."
          className="mb-6"
        >
          Nobody can demote or suspend the last one — that is deliberate — but
          it also means losing access to that account leaves the platform with
          nobody who can set fees or appoint staff. Invite a second one below.
        </Callout>
      ) : null}

      <StatGrid>
        <Stat
          label="With access"
          value={members.length}
          info="Everyone who is not a plain member."
          icon={UsersIcon}
        />
        <Stat
          label="Free to take a deal"
          value={available.length}
          tone={
            available.length === 0 && agents.length > 0 ? "danger" : "neutral"
          }
          info="Can take another Safest channel."
          // Only the warnings stay on the card: a desk that cannot take a
          // Safest deal is a finding, not a definition.
          note={
            agents.length === 0
              ? "Nobody runs deals. Safest deals cannot be taken at all."
              : available.length === 0
                ? "Everyone who runs deals is at the cap. No Safest deal can be picked up."
                : undefined
          }
        />
        <Stat
          label="At the cap"
          value={atCap.length}
          tone={atCap.length > 0 ? "danger" : "neutral"}
          info="Holding the most channels one agent may own."
        />
        <Stat
          label="Invitations out"
          value={live.length}
          tone={live.length > 0 ? "primary" : "neutral"}
          info="Links handed out and not yet used."
          note={
            invites.length > live.length
              ? `${invites.length - live.length} expired and still listed.`
              : undefined
          }
        />
      </StatGrid>

      {noIdentity.length > 0 || noTwoFactor.length > 0 ? (
        <Section
          id="gaps"
          title="Worth fixing"
          tone="primary"
          count={noIdentity.length + noTwoFactor.length}
          // Each row says what is missing; why it matters is said once,
          // here, rather than on every row.
          info={
            <>
              <span className="block">
                Neither of these stops anything today. Both are how a transfer
                goes wrong quietly.
              </span>
              {noIdentity.length > 0 ? (
                <span className="mt-2 block">
                  Missing an account sellers hand a deal to — an email, a
                  Telegram username or a Facebook account — so deals on that
                  platform cannot be taken by them or given to them.
                </span>
              ) : null}
              {noTwoFactor.length > 0 ? (
                <span className="mt-2 block">
                  <span className="font-medium text-fg">Two-factor:</span> Only
                  they can turn it on, under Security on their own dashboard.
                </span>
              ) : null}
            </>
          }
        >
          <List>
            {noIdentity.map((agent) => (
              <ListItem
                key={`id-${agent.id}`}
                href={`/admin/users/${agent.id}`}
                flag="primary"
              >
                <ListRow
                  leading={
                    <Avatar name={agent.name} className="size-8 text-xs" />
                  }
                  title={agent.name}
                  meta={missingLine(agent)}
                  trailing={
                    <span className="hidden text-[0.8125rem] font-medium text-muted transition-colors group-hover:text-fg sm:inline">
                      Set it
                    </span>
                  }
                  chevron
                />
              </ListItem>
            ))}
            {noTwoFactor.map((member) => (
              <ListItem
                key={`2fa-${member.id}`}
                href={`/admin/users/${member.id}`}
                flag="primary"
              >
                <ListRow
                  leading={
                    <Avatar name={member.name} className="size-8 text-xs" />
                  }
                  title={member.name}
                  meta={`${ROLE_LABELS[member.role]} with no second factor.`}
                  trailing={
                    <span className="hidden text-[0.8125rem] font-medium text-muted transition-colors group-hover:text-fg sm:inline">
                      Their account
                    </span>
                  }
                  chevron
                />
              </ListItem>
            ))}
          </List>
        </Section>
      ) : null}

      <Section
        id="people"
        title="With access"
        count={members.length}
        info="Open an account to change what somebody can reach, set the deal level and transfer identity of anyone who runs deals, or suspend them."
      >
        {members.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Nobody has staff access"
            body="Not even you, which cannot be true — so this is a database that has not been set up rather than an empty team."
          />
        ) : (
          <TableCard>
            <table className="w-full min-w-[54rem] border-collapse">
              <caption className="sr-only">
                Everyone with access: role, channels held against the cap,
                two-factor, when they joined, and whether they are suspended.
              </caption>
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th>Role</Th>
                  <Th>Deal level</Th>
                  <Th numeric>Holding</Th>
                  <Th numeric>Live deals</Th>
                  <Th>Two-factor</Th>
                  <Th>Joined</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <Tr key={member.id}>
                    {/* The person cell is the link, stretched over the cell. */}
                    <Td className="relative">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={member.name} className="size-8 text-xs" />
                        <div className="min-w-0">
                          <Link
                            href={`/admin/users/${member.id}`}
                            className="block max-w-[15rem] truncate text-sm leading-5 font-medium text-fg underline-offset-4 after:absolute after:inset-0 hover:underline"
                          >
                            {member.name}
                            {member.id === staff.id ? (
                              <span className="ml-1.5 text-xs font-normal text-subtle">
                                (you)
                              </span>
                            ) : null}
                          </Link>
                          <span className="block max-w-[15rem] truncate text-[0.8125rem] leading-5 text-muted">
                            {member.email}
                          </span>
                          {/* What sellers hand their deals to, per platform:
                              a sign-in email is not one of them. */}
                          {isCustodianRole(member.role) ? (
                            <span className="block max-w-[15rem] truncate text-xs leading-5 text-subtle">
                              {handsOverTo(member)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge variant={ROLE_VARIANT[member.role]}>
                        {ROLE_LABELS[member.role]}
                      </Badge>
                    </Td>
                    <Td>
                      {isCustodianRole(member.role) ? (
                        <span
                          className={cn(
                            "text-[0.8125rem] whitespace-nowrap",
                            member.dealLevel ? "text-fg" : "text-subtle",
                          )}
                        >
                          {levelLabel(member.dealLevel)}
                        </span>
                      ) : (
                        <span className="text-subtle">
                          &mdash;
                          <span className="sr-only">does not run deals</span>
                        </span>
                      )}
                    </Td>
                    <Td numeric>
                      <Load
                        role={member.role}
                        holds={member.holds}
                        cap={maxHoldsPerAgent}
                      />
                    </Td>
                    <Td
                      numeric
                      className={
                        member.liveDeals === 0 ? "text-subtle" : "text-fg"
                      }
                    >
                      {member.liveDeals.toLocaleString("en-US")}
                    </Td>
                    <Td>
                      <TwoFactor on={member.twoFactorEnabled} />
                    </Td>
                    <Td>
                      <time
                        dateTime={member.createdAt.toISOString()}
                        className="text-[0.8125rem] whitespace-nowrap text-subtle tabular-nums"
                      >
                        {member.createdAt.toLocaleDateString("en-GB", DATE)}
                      </time>
                    </Td>
                    <Td>
                      {member.banned ? (
                        <Badge variant="danger">Suspended</Badge>
                      ) : !member.emailVerified &&
                        emailVerificationRequired() ? (
                        <Badge>Email unverified</Badge>
                      ) : (
                        <span className="text-[0.8125rem] text-subtle">
                          Active
                        </span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </Section>

      {invites.length > 0 ? (
        <Section
          id="invitations"
          title="Invitations out"
          count={invites.length}
          tone={live.length > 0 ? "primary" : "neutral"}
          // What the links are is on the figure above; what holding one
          // allows is a security fact, so it stays in view.
          description="Anyone holding one can create that account, so withdraw any you are no longer sure about."
        >
          <List>
            {invites.map((invite) => {
              const age = elapsed(invite.createdAt);
              return (
                <ListItem
                  key={invite.id}
                  flag={invite.expired ? undefined : "primary"}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <IconTile icon={MailIcon} />
                      <div className="min-w-0">
                        <p className="truncate text-sm leading-5 font-medium text-fg">
                          {invite.email}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] leading-5 text-muted">
                          <Badge variant={ROLE_VARIANT[invite.role]}>
                            {ROLE_LABELS[invite.role]}
                          </Badge>
                          {invite.expired ? (
                            <Badge variant="danger">Expired</Badge>
                          ) : null}
                          <span className="inline-flex items-center gap-1">
                            <ClockIcon
                              aria-hidden="true"
                              className={`size-3.5 ${iconText(ClockIcon)}`}
                            />
                            {invite.expired ? (
                              "The link no longer works"
                            ) : (
                              <time dateTime={invite.expiresAt.toISOString()}>
                                Expires{" "}
                                {invite.expiresAt.toLocaleString(
                                  "en-GB",
                                  EXPIRES,
                                )}
                              </time>
                            )}
                          </span>
                          <Sep />
                          <span>
                            {age.label === "just now"
                              ? "Invited just now"
                              : `Invited ${age.label} ago`}
                            {invite.invitedByName
                              ? ` by ${invite.invitedByName}`
                              : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                    <RevokeInvite inviteId={invite.id} email={invite.email} />
                  </div>
                </ListItem>
              );
            })}
          </List>
        </Section>
      ) : null}

      <Section id="invite" title="Hire somebody" className="scroll-mt-20">
        <InviteTeammate
          roles={INVITABLE_ROLES}
          labels={ROLE_LABELS}
          blurbs={ROLE_BLURBS}
          consequences={ROLE_CONSEQUENCES}
        />
      </Section>
    </>
  );
}
