import {
  ClockIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ConsoleHeader,
  ConsoleSection,
  MetaItem,
  Metric,
  MetricGrid,
  Nothing,
  Panel,
  RowItem,
  Rows,
  TableScroller,
  Td,
  Th,
} from "@/components/admin/console";
import { InviteTeammate, RevokeInvite } from "@/components/admin/team-controls";
import { elapsed, ROLE_VARIANT } from "@/components/admin/vocab";
import { Badge } from "@/components/ui/badge";
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
      <span className="text-xs text-subtle">
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
          "tnum text-sm font-semibold",
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
      <ConsoleHeader
        eyebrow="Platform"
        title="Team"
        description="Everyone who can reach the staff area, what they can do, and — for agents — how many channels they are holding against the cap. Inviting somebody, changing what they can reach and suspending them all happen here or on their account page; none of it needs a developer."
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            <MetaItem label="With access">
              {members.length.toLocaleString("en-US")}
            </MetaItem>
            <MetaItem label="Per-agent cap">
              {maxHoldsPerAgent.toLocaleString("en-US")} channels
            </MetaItem>
          </>
        }
      />

      {/* A platform with one superadmin is a platform one locked-out phone
          away from needing a developer and a database console. */}
      {activeSuperadmins < 2 ? (
        <Panel tone="danger" className="mt-5">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-fg">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-danger"
            />
            <span>
              <strong className="font-semibold">
                There is only one superadmin who can sign in.
              </strong>{" "}
              Nobody can demote or suspend the last one — that is deliberate —
              but it also means losing access to that account leaves the
              platform with nobody who can set fees or appoint staff. Invite a
              second one below.
            </span>
          </p>
        </Panel>
      ) : null}

      <MetricGrid className="mt-5">
        <Metric
          label="With access"
          value={members.length}
          note="Everyone who is not a plain member."
          icon={UsersIcon}
        />
        <Metric
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
        <Metric
          label="At the cap"
          value={atCap.length}
          tone={atCap.length > 0 ? "danger" : "neutral"}
          note="Holding the most channels one agent may own."
        />
        <Metric
          label="Invitations out"
          value={live.length}
          tone={live.length > 0 ? "primary" : "neutral"}
          note={
            invites.length > live.length
              ? `${invites.length - live.length} expired and still listed.`
              : "Links handed out and not yet used."
          }
        />
      </MetricGrid>

      {noIdentity.length > 0 || noTwoFactor.length > 0 ? (
        <ConsoleSection
          id="gaps"
          title="Worth fixing"
          tone="primary"
          count={noIdentity.length + noTwoFactor.length}
          description="Neither of these stops anything today. Both are how a transfer goes wrong quietly."
        >
          <Rows>
            {noIdentity.map((agent) => (
              <RowItem key={`id-${agent.id}`} flag="primary">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 pl-5">
                  <p className="min-w-0 text-sm leading-relaxed text-fg">
                    <strong className="font-semibold">{agent.name}</strong> has
                    no transfer identity, so whoever assigns them a deal types
                    the address a seller is told to invite. One typo is a
                    channel invited to nobody.
                  </p>
                  <Link
                    href={`/admin/users/${agent.id}`}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium text-primary-text underline-offset-4 hover:underline"
                  >
                    Set it
                    <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </RowItem>
            ))}
            {noTwoFactor.map((member) => (
              <RowItem key={`2fa-${member.id}`} flag="primary">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 pl-5">
                  <p className="min-w-0 text-sm leading-relaxed text-fg">
                    <strong className="font-semibold">{member.name}</strong> (
                    {ROLE_LABELS[member.role].toLowerCase()}) has no second
                    factor. Only they can turn it on, under Security on their
                    own dashboard.
                  </p>
                  <Link
                    href={`/admin/users/${member.id}`}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium text-primary-text underline-offset-4 hover:underline"
                  >
                    Their account
                    <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </RowItem>
            ))}
          </Rows>
        </ConsoleSection>
      ) : null}

      <ConsoleSection
        id="people"
        title="With access"
        count={members.length}
        description="Open an account to change what somebody can reach, set an agent's transfer identity, or suspend them."
      >
        {members.length === 0 ? (
          <Nothing
            title="Nobody has staff access"
            body="Not even you, which cannot be true — so this is a database that has not been set up rather than an empty team."
          />
        ) : (
          <TableScroller>
            <table className="w-full min-w-[46rem] border-collapse text-sm">
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
                  <tr
                    key={member.id}
                    className="border-t border-line first:border-t-0"
                  >
                    <Td>
                      <Link
                        href={`/admin/users/${member.id}`}
                        className="block min-w-0 underline-offset-4 hover:underline"
                      >
                        <span className="block font-semibold text-fg">
                          {member.name}
                          {member.id === staff.id ? (
                            <span className="ml-1.5 text-xs font-normal text-subtle">
                              (you)
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-subtle">
                          {member.agentEmail ?? member.email}
                        </span>
                      </Link>
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
                    <Td numeric>
                      <span className="tnum text-sm text-muted">
                        {member.liveDeals.toLocaleString("en-US")}
                      </span>
                    </Td>
                    <Td>
                      <TwoFactor on={member.twoFactorEnabled} />
                    </Td>
                    <Td>
                      <time
                        dateTime={member.createdAt.toISOString()}
                        className="tnum text-xs whitespace-nowrap text-muted"
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
                        <span className="text-xs text-subtle">Active</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroller>
        )}
      </ConsoleSection>

      {invites.length > 0 ? (
        <ConsoleSection
          id="invitations"
          title="Invitations out"
          count={invites.length}
          tone={live.length > 0 ? "primary" : "neutral"}
          description="Links handed out and not yet used. Anyone holding one can create that account, so withdraw any you are no longer sure about."
        >
          <Rows>
            {invites.map((invite) => {
              const age = elapsed(invite.createdAt);
              return (
                <RowItem
                  key={invite.id}
                  flag={invite.expired ? undefined : "primary"}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 p-4 pl-5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-fg">
                          {invite.email}
                        </span>
                        <Badge variant={ROLE_VARIANT[invite.role]}>
                          {ROLE_LABELS[invite.role]}
                        </Badge>
                        {invite.expired ? (
                          <Badge variant="danger">Expired</Badge>
                        ) : null}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon aria-hidden="true" className="size-3" />
                          {invite.expired
                            ? "The link no longer works"
                            : `Expires ${invite.expiresAt.toLocaleString("en-GB")}`}
                        </span>
                        <span>
                          Invited {age.label} ago
                          {invite.invitedByName
                            ? ` by ${invite.invitedByName}`
                            : ""}
                        </span>
                      </p>
                    </div>
                    <RevokeInvite inviteId={invite.id} email={invite.email} />
                  </div>
                </RowItem>
              );
            })}
          </Rows>
        </ConsoleSection>
      ) : null}

      <ConsoleSection
        id="invite"
        title="Hire somebody"
        description="An agent, a moderator, someone on finance, or a second superadmin. They set their own password, so no password is ever shared, typed for them or sent by email."
      >
        <InviteTeammate
          roles={INVITABLE_ROLES}
          labels={ROLE_LABELS}
          blurbs={ROLE_BLURBS}
          consequences={ROLE_CONSEQUENCES}
        />
      </ConsoleSection>
    </>
  );
}
