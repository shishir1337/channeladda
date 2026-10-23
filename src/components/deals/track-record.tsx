import { pointsLabel } from "@/components/app/reseller-badge";
import { Price } from "@/components/ui/price";
import type { TrackRecord } from "@/lib/track-record";
import { cn } from "@/lib/utils";

/**
 * Somebody's completed deals, for the other side to weigh before agreeing.
 *
 * Two shapes of the same figures: a grid for a profile, and one line for the
 * top of a conversation, where the decision is actually made.
 */

function deals(n: number) {
  return `${n} ${n === 1 ? "deal" : "deals"}`;
}

export function TrackRecordStats({
  record,
  className,
}: {
  record: TrackRecord;
  className?: string;
}) {
  // All deals as one figure: which of our two flows someone used says
  // nothing about them, and a profile reading "Safest deals 0 · $0.00" looked
  // like a mark against them.
  const items = [
    { label: "Deals done", value: <>{record.deals}</> },
    {
      label: "Deal worth",
      value: <Price usd={record.worthCents / 100} compact />,
    },
  ];

  return (
    <dl className={cn("grid grid-cols-2 gap-4", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-subtle">{item.label}</dt>
          <dd className="tnum mt-1 truncate text-sm font-semibold text-fg">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "750 points · 12 deals · $84K", or plainly that there are none. */
export function TrackRecordLine({
  record,
  points,
  className,
}: {
  record: TrackRecord;
  /** Rating points, when known: what the deals are worth to their name. */
  points?: number;
  className?: string;
}) {
  if (record.deals === 0) {
    return (
      <span className={cn("text-subtle", className)}>
        No completed deals yet
      </span>
    );
  }
  return (
    <span className={cn("tnum", className)}>
      {points !== undefined ? (
        <>
          <span className="font-medium text-fg">{pointsLabel(points)}</span>
          {" · "}
        </>
      ) : null}
      <span className="font-medium text-fg">{deals(record.deals)}</span>
      {" · "}
      <Price usd={record.worthCents / 100} compact />
    </span>
  );
}
