import {
  CalendarClockIcon,
  GavelIcon,
  HourglassIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import {
  AllClear,
  Amount,
  ConsoleHeader,
  MetaItem,
  Metric,
  MetricGrid,
} from "@/components/admin/console";
import {
  DECISION_HOURS,
  DisputeCase,
  FIRST_RESPONSE_HOURS,
} from "@/components/admin/dispute-case";
import { elapsed, Waited } from "@/components/admin/vocab";
import { listDisputes } from "@/server/admin-disputes";
import { requireStaff } from "@/server/session";

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
      <ConsoleHeader
        eyebrow="Transfers"
        title="Dispute desk"
        description="Every frozen deal, the one that has waited longest first. Read what was said, check who holds the channel and the money, then decide it — the decision and its reason go on the record under your name."
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            <MetaItem label="Desk">
              {staff.role.toLowerCase().replace("_", " ")}
            </MetaItem>
            <MetaItem label="Read">
              {new Date().toLocaleString("en-GB")}
            </MetaItem>
          </>
        }
      />

      <MetricGrid className="mt-6">
        <Metric
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
          note="Nothing on these moves until somebody decides it."
        />
        <Metric
          label="Over 48 hours"
          value={unanswered}
          icon={HourglassIcon}
          tone={unanswered > 0 ? "primary" : "neutral"}
          note="The Terms promise a first response within 48 hours."
        />
        <Metric
          label="Past seven days"
          value={overdue}
          icon={CalendarClockIcon}
          tone={overdue > 0 ? "danger" : "neutral"}
          note="The Terms promise a decision within seven days."
        />
        {/* A money total is finance's figure, as everywhere else in the
            staff area. Each case still shows its own, because nobody can
            decide a dispute without knowing what we hold on it. */}
        {canMoveMoney ? (
          <Metric
            label="We hold"
            value={<Amount cents={held} size="lg" />}
            icon={WalletIcon}
            note="On our books across every frozen deal."
          />
        ) : null}
      </MetricGrid>

      <div className="mt-7">
        {disputes.length === 0 ? (
          <AllClear
            title="No deal is frozen"
            body="Nothing is waiting on a decision. A deal lands here the moment either side raises a dispute, or the payment processor sends a payment back."
          />
        ) : (
          <ol
            aria-label="Frozen deals, longest wait first"
            className="flex flex-col gap-5"
          >
            {disputes.map((dispute) => (
              <li key={dispute.orderId}>
                <DisputeCase dispute={dispute} canMoveMoney={canMoveMoney} />
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
