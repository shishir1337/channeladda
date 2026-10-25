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
import { settingsDiff } from "@/lib/settings-history";
import { getAuditTrail } from "@/server/audit";
import { requireSuperadmin } from "@/server/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Platform settings",
  robots: { index: false, follow: false },
};

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
        An order keeps the fee it was charged. The rest applies from the moment
        you save, to deals already open as well: a new payment window is counted
        from when each unpaid deal was opened, and the second-approval amount
        and the hold cap are checked at the next press.
      </Callout>

      <SettingsForm
        current={{
          buyerFeeBpSafest: settings.buyerFeeBpSafest,
          googleReviewUrl: settings.googleReviewUrl,
          buyerFeeBpFastest: settings.buyerFeeBpFastest,
          maxHoldsPerAgent: settings.maxHoldsPerAgent,
          secondApprovalAboveUsd: settings.secondApprovalAboveUsd,
          sellerFeeBp: settings.sellerFeeBp,
          offerExpiryHours: settings.offerExpiryHours,
          minWithdrawalUsd: settings.minWithdrawalUsd,
          paymentWindowHours: settings.paymentWindowHours,
          resellerPriceUsd: settings.resellerPriceUsd,
          resellerDiscountBp: settings.resellerDiscountBp,
          resellerPointsMultiplier: settings.resellerPointsMultiplier,
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
                  const diff = settingsDiff(row.before, row.after);
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
