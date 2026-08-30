"use client";

import { FlagIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { REPORT_REASONS } from "@/lib/reports";
import { reportListing } from "@/server/actions/reports";

/**
 * Flag a listing.
 *
 * This used to be a link to the support page, which validated a form and then
 * told you it had been sent without sending anything. Someone reporting a scam
 * was thanked and ignored. It writes a real row now, and a moderator sees it.
 */
export function ReportListing({
  listingId,
  listingSlug,
}: {
  listingId: string;
  listingSlug: string;
}) {
  const reasonId = useId();
  const detailId = useId();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return <output className="block text-xs text-verified">{done}</output>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-xs text-subtle transition-colors hover:text-danger"
      >
        <FlagIcon aria-hidden="true" className="size-3.5" />
        Report listing
      </button>
    );
  }

  if (!session?.user) {
    return (
      <div className="rounded-xl border border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
        Sign in to report a listing, so a moderator can come back to you.
        <Link
          href={`/signin?next=/listing/${listingSlug}`}
          className="ml-1 font-medium text-primary-text underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <label htmlFor={reasonId} className="block text-xs font-medium text-fg">
        What is wrong with it?
      </label>
      <select
        id={reasonId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-1.5 h-10 w-full cursor-pointer appearance-none rounded-lg border border-line bg-surface px-2.5 text-xs text-fg focus:border-primary/60 focus:outline-none"
      >
        {REPORT_REASONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <label
        htmlFor={detailId}
        className="mt-2.5 block text-xs font-medium text-fg"
      >
        Anything else? (optional)
      </label>
      <textarea
        id={detailId}
        rows={2}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-line bg-surface p-2.5 text-xs text-fg focus:border-primary/60 focus:outline-none"
      />

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-2.5 flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await reportListing(listingId, reason, detail);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setDone(result.message);
            });
          }}
        >
          {pending ? "Sending…" : "Send report"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
