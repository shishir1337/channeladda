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
  if (role !== "AGENT") {
    return (
      <span className="text-subtle">
        &mdash;<span className="sr-only">not an agent</span>
      </span>
    );
  }

  const atCap = holds >= cap;
  const nearCap = !atCap && holds >= cap - 1;

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span
        className={cn(
          "text-sm font-medium tabular-nums",
          atCap ? "text-danger" : nearCap ? "text-primary-text" : "text-fg",
        )}
      >
        {holds} of {cap}
      </span>
      {atCap ? (
        <Badge variant="danger">
          <TriangleAlertIcon aria-hidden="true" />
          At cap
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

  const agents = members.filter((member) => member.role === "AGENT");
  const atCap = agents.filter(
    (agent) => !agent.banned && agent.holds >= maxHoldsPerAgent,
  );
  const available = agents.filter(
    (agent) => !agent.banned && agent.holds < maxHoldsPerAgent,
  );
  const noIdentity = agents.filter((agent) => agent.agentEmail === null);
  const noTwoFactor = members.filter(
    (member) => !member.twoFactorEnabled && !member.banned,
  );
  const live = invites.filter((invite) => !invite.expired);

  return (
    <>
      <PageHeader
        title="Team"
        description="Everyone who can reach the staff area, what they can do, and how many channels each agent holds against the cap."
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
          note="Everyone who is not a plain member."
          icon={UsersIcon}
        />
        <Stat
          label="Agents free"
          value={available.length}
          tone={
            available.length === 0 && agents.length > 0 ? "danger" : "neutral"
          }
          note={
            agents.length === 0
              ? "No agents. Safest deals cannot be taken at all."
              : available.length === 0
                ? "Every agent is at the cap. No Safest deal can be picked up."
                : "Can take another Safest channel."
          }
        />
        <Stat
          label="At the cap"
          value={atCap.length}
          tone={atCap.length > 0 ? "danger" : "neutral"}
          note="Holding the most channels one agent may own."
        />
        <Stat
          label="Invitations out"
          value={live.length}
          tone={live.length > 0 ? "primary" : "neutral"}
          note={
            invites.length > live.length
              ? `${invites.length - live.length} expired and still listed.`
              : "Links handed out and not yet used."
          }
        />
      </StatGrid>

      {noIdentity.length > 0 || noTwoFactor.length > 0 ? (
        <Section
          id="gaps"
          title="Worth fixing"
          tone="primary"
          count={noIdentity.length + noTwoFactor.length}
          description="Neither of these stops anything today. Both are how a transfer goes wrong quietly."
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
                  meta={
                    <span className="whitespace-normal">
                      Has no transfer identity, so whoever assigns them a deal
                      types the address a seller is told to invite. One typo is
                      a channel invited to nobody.
                    </span>
                  }
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
                  meta={
                    <span className="whitespace-normal">
                      {ROLE_LABELS[member.role]} with no second factor. Only
                      they can turn it on, under Security on their own
                      dashboard.
                    </span>
                  }
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
        description="Open an account to change what somebody can reach, set an agent's transfer identity, or suspend them."
      >
        {members.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Nobody has staff access"
            body="Not even you, which cannot be true — so this is a database that has not been set up rather than an empty team."
          />
        ) : (
          <TableCard>
            <table className="w-full min-w-[46rem] border-collapse">
              <caption className="sr-only">
                Everyone with access: role, channels held against the cap,
                two-factor, when they joined, and whether they are suspended.
              </caption>
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th>Role</Th>
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
                            {member.agentEmail ?? member.email}
                          </span>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge variant={ROLE_VARIANT[member.role]}>
                        {ROLE_LABELS[member.role]}
                      </Badge>
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
                      ) : !member.emailVerified ? (
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
          description="Links handed out and not yet used. Anyone holding one can create that account, so withdraw any you are no longer sure about."
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
                              className="size-3.5 text-subtle"
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

      <Section
        id="invite"
        title="Hire somebody"
        description="An agent, a moderator, someone on finance, or a second superadmin."
        className="scroll-mt-20"
      >
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
