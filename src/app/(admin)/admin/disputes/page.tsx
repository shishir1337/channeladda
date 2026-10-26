import {
  CalendarClockIcon,
  GavelIcon,
  HourglassIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import {
  DECISION_HOURS,
  DisputeCase,
  FIRST_RESPONSE_HOURS,
} from "@/components/admin/dispute-case";
import { elapsed, TitleWithInfo, Waited } from "@/components/admin/vocab";
import {
  AllClear,
  MetaItem,
  Meter,
  PageHeader,
  Stat,
  StatGrid,
} from "@/components/app/kit";
import { Price } from "@/components/ui/price";
import { dayAndTime } from "@/lib/time";
import { listDisputes } from "@/server/admin-disputes";
import { requireStaff } from "@/server/session";
import { viewerZone } from "@/server/viewer-zone";

export const metadata: Metadata = {
  title: "Disputes",
  robots: { index: false, follow: false },
};

/**
 * The dispute desk.
 *
 * Every deal in DISPUTED, the one frozen longest first, each with the record
 * it will be decided from. The Terms promise to "decide disputes fairly on the
 * record in front of us", and before this the record was in the audit trail
 * and in front of nobody: a disputed deal was a red flag in the in-flight
 * list, and the reason for it was never rendered anywhere.
 *
 * `requireStaff`, so MODERATOR, FINANCE and SUPERADMIN. Not AGENT: the record
 * is both sides' account of a deal, often one the agent is on, and an agent
 * who wanders here gets the same 404 a stranger would. Which outcomes each
 * desk may choose is still decided by `resolveDeal`, not by this page.
 */
export default async function DisputesPage() {
  const staff = await requireStaff();
  const canMoveMoney = staff.role === "FINANCE" || staff.role === "SUPERADMIN";
  const zone = await viewerZone();

  // Never null past the guard above; the fallback only satisfies the type.
  const disputes = (await listDisputes(staff)) ?? [];

  const over = (hours: number) =>
    disputes.filter((d) => elapsed(d.waitingSince).hours >= hours).length;
  const unanswered = over(FIRST_RESPONSE_HOURS);
  const overdue = over(DECISION_HOURS);
  const oldest = disputes.at(0)?.waitingSince;
  const held = disputes.reduce((sum, d) => sum + d.heldUsd, 0);

  return (
    <>
      <PageHeader
        title="Dispute desk"
        info="Every frozen deal, longest wait first. The decision and its reason go on the record under your name."
        // Only the read time: the two deadline figures below are counted
        // against it, so a tab left open says how old they are.
        meta={<MetaItem label="Read">{dayAndTime(new Date(), zone)}</MetaItem>}
      />

      <StatGrid columns={canMoveMoney ? 4 : 3}>
        <Stat
          label="Frozen deals"
          value={disputes.length}
          icon={GavelIcon}
          tone={disputes.length > 0 ? "primary" : "neutral"}
          chip={
            oldest ? (
              <Waited
                since={oldest}
                prefix="oldest"
                warnAfter={FIRST_RESPONSE_HOURS}
                lateAfter={DECISION_HOURS}
              />
            ) : null
          }
          info="Nothing on these moves until somebody decides it."
        />
        {/* Each deadline figure carries a bar of how much of the desk it
            is, so a bad day reads before the number does. */}
        <Stat
          label="Over 48 hours"
          value={unanswered}
          icon={HourglassIcon}
          tone={unanswered > 0 ? "primary" : "neutral"}
          chip={
            disputes.length > 0 ? (
              <Meter
                value={unanswered}
                max={disputes.length}
                tone="primary"
                label={`${unanswered} of ${disputes.length} frozen deals over 48 hours`}
              />
            ) : null
          }
          note="The Terms promise a first response within 48 hours."
        />
        <Stat
          label="Past seven days"
          value={overdue}
          icon={CalendarClockIcon}
          tone={overdue > 0 ? "danger" : "neutral"}
          chip={
            disputes.length > 0 ? (
              <Meter
                value={overdue}
                max={disputes.length}
                tone="danger"
                label={`${overdue} of ${disputes.length} frozen deals past seven days`}
              />
            ) : null
          }
          note="The Terms promise a decision within seven days."
        />
        {/* A money total is finance's figure, as everywhere else in the
            staff area. Each case still shows its own, because nobody can
            decide a dispute without knowing what we hold on it. Every figure
            is integer cents and `Price` takes dollars — the same conversion
            `Amount` does — drawn at the size of the other figures. */}
        {canMoveMoney ? (
          <Stat
            label="We hold"
            value={<Price usd={held / 100} />}
            icon={WalletIcon}
            info="On our books across every frozen deal."
          />
        ) : null}
      </StatGrid>

      <div className="mt-8">
        {disputes.length === 0 ? (
          <AllClear
            title={
              <TitleWithInfo
                title="No deal is frozen"
                label="How a deal gets here"
              >
                A deal lands here the moment either side raises a dispute, or
                the payment processor sends a payment back.
              </TitleWithInfo>
            }
          />
        ) : (
          <ol
            aria-label="Frozen deals, longest wait first"
            className="flex flex-col gap-4"
          >
            {disputes.map((dispute) => (
              <li key={dispute.orderId}>
                <DisputeCase
                  dispute={dispute}
                  canMoveMoney={canMoveMoney}
                  zone={zone}
                />
              </li>
            ))}
          </ol>
        )}
        {disputes.length === 100 ? (
          <p className="mt-4 text-xs text-subtle">
            Showing the first hundred. Decide some and the rest will appear.
          </p>
        ) : null}
      </div>
    </>
  );
}
