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
  const items = [
    { label: "Deals done", value: <>{record.deals}</> },
    {
      label: "Deal worth",
      value: <Price usd={record.worthCents / 100} compact />,
    },
    {
      label: "Safest deals",
      value: (
        <>
          {record.safest.deals}
          <span className="font-normal text-subtle">
            {" · "}
            <Price usd={record.safest.worthCents / 100} compact />
          </span>
        </>
      ),
    },
    {
      label: "Fastest deals",
      value: (
        <>
          {record.fastest.deals}
          <span className="font-normal text-subtle">
            {" · "}
            <Price usd={record.fastest.worthCents / 100} compact />
          </span>
        </>
      ),
    },
  ];

  return (
    <dl className={cn("grid grid-cols-2 gap-4 sm:grid-cols-4", className)}>
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

/** "12 deals · $84K · Safest 8 · Fastest 4", or plainly that there are none. */
export function TrackRecordLine({
  record,
  className,
}: {
  record: TrackRecord;
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
      <span className="font-medium text-fg">{deals(record.deals)}</span>
      {" · "}
      <Price usd={record.worthCents / 100} compact />
      {" · "}
      Safest {record.safest.deals}
      {" · "}
      Fastest {record.fastest.deals}
    </span>
  );
}
