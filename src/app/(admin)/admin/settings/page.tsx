import { HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/settings-form";
import { elapsed } from "@/components/admin/vocab";
import {
  Callout,
  EmptyState,
  MetaItem,
  PageHeader,
  Section,
  TableCard,
  Td,
  Th,
  Tr,
} from "@/components/app/kit";
import { getAuditTrail } from "@/server/audit";
import { requireSuperadmin } from "@/server/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Platform settings",
  robots: { index: false, follow: false },
};

/** What each stored setting is called in the change history. */
const FIELD_LABEL: Record<string, string> = {
  buyerFeeBp: "Buyer fee (single rate, since split)",
  buyerFeeBpSafest: "Buyer fee, Safest",
  buyerFeeBpFastest: "Buyer fee, Fastest",
  sellerFeeBp: "Seller fee",
  maxHoldsPerAgent: "Channels one agent may hold",
  secondApprovalAboveUsd: "Second approval above",
  offerExpiryHours: "Offers expire after",
  minWithdrawalUsd: "Smallest withdrawal",
};

/** Basis points as a percentage, cents as dollars, everything else as typed. */
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "not set";
  if (typeof value !== "number") return String(value);
  if (key.includes("Bp")) return `${value / 100}%`;
  if (key.endsWith("Usd")) {
    return (value / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  }
  if (key === "offerExpiryHours") return `${value} hours`;
  return value.toLocaleString("en-US");
}

/**
 * What actually moved between two audit snapshots.
 *
 * The history used to print `before.buyerFeeBp → after.buyerFeeBp` from a
 * hard-coded pair of keys. That key stopped existing when the buyer fee was
 * split per mode, so every row since has read "buyer 0% → 0%, seller 0% → 0%"
 * — a change log that reports nothing changed. Diffing whatever keys the
 * snapshots actually carry survives the next such split too.
 */
function diffOf(before: unknown, after: unknown) {
  const from = (before ?? {}) as Record<string, unknown>;
  const to = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])];
  return keys
    .filter((key) => from[key] !== to[key])
    .map((key) => ({
      key,
      label: FIELD_LABEL[key] ?? key,
      from: formatValue(key, from[key]),
      to: formatValue(key, to[key]),
    }));
}

export default async function AdminSettingsPage() {
  await requireSuperadmin();
  const settings = await getSettings();
  const trail = await getAuditTrail(
    { entity: "user", entityId: "platform-settings" },
    10,
  );

  return (
    <>
      <PageHeader
        title="Platform settings"
        info="The figures every future deal is priced and policed by."
        meta={
          <MetaItem label="Last changed">
            {settings.updatedAt && settings.updatedByName
              ? `${settings.updatedByName}, ${elapsed(settings.updatedAt).label} ago`
              : "never since launch"}
          </MetaItem>
        }
      />

      {/* The promise that matters most on this page, kept word for word from
          the old header and given its own line so it is not lost in it. */}
      <Callout title="Nothing here rewrites a past sale" className="mb-6">
        An order keeps the fee it was charged, and a deal in flight keeps the
        safeguards it started under.
      </Callout>

      <SettingsForm
        current={{
          buyerFeeBpSafest: settings.buyerFeeBpSafest,
          buyerFeeBpFastest: settings.buyerFeeBpFastest,
          maxHoldsPerAgent: settings.maxHoldsPerAgent,
          secondApprovalAboveUsd: settings.secondApprovalAboveUsd,
          sellerFeeBp: settings.sellerFeeBp,
          offerExpiryHours: settings.offerExpiryHours,
          minWithdrawalUsd: settings.minWithdrawalUsd,
          paymentWindowHours: settings.paymentWindowHours,
        }}
      />

      <Section
        id="history"
        title="Change history"
        count={trail.length}
        info="The last ten changes, read from the audit trail. Rows are never edited or deleted."
      >
        {trail.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="Never changed since launch"
            body="Every change you make here is written to this list under your name."
          />
        ) : (
          <TableCard>
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">
                Platform settings changes, newest first
              </caption>
              <thead>
                <tr>
                  <Th className="w-32">When</Th>
                  <Th className="w-44">Who</Th>
                  <Th>What moved</Th>
                </tr>
              </thead>
              <tbody>
                {trail.map((row) => {
                  const diff = diffOf(row.before, row.after);
                  return (
                    <Tr key={row.id}>
                      <Td className="align-top whitespace-nowrap">
                        <time
                          dateTime={row.createdAt.toISOString()}
                          title={row.createdAt.toLocaleString("en-GB")}
                          className="tnum text-[0.8125rem] text-muted"
                        >
                          {row.createdAt.toLocaleDateString("en-GB")}
                        </time>
                      </Td>
                      <Td className="align-top font-medium whitespace-nowrap text-fg">
                        {row.actorName ?? "Someone"}
                      </Td>
                      <Td className="align-top">
                        {diff.length === 0 ? (
                          <span className="text-[0.8125rem] text-subtle">
                            no recorded difference
                          </span>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {diff.map((change) => (
                              <li
                                key={change.key}
                                className="flex flex-wrap items-baseline gap-x-2 text-[0.8125rem]"
                              >
                                <span className="text-muted">
                                  {change.label}
                                </span>
                                <span className="sr-only">changed from</span>
                                <span className="tnum text-subtle line-through decoration-subtle/60">
                                  {change.from}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="text-subtle"
                                >
                                  →
                                </span>
                                <span className="sr-only">to</span>
                                <span className="tnum font-medium text-fg">
                                  {change.to}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>
        )}
      </Section>
    </>
  );
}
