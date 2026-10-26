import { DownloadIcon, ImageIcon, PartyPopperIcon } from "lucide-react";
import Link from "next/link";
import { completeWords } from "@/components/deals/deal-status";
import { Button } from "@/components/ui/button";
import type { DealMode, Platform } from "@/generated/prisma/enums";
import type { DealActor } from "@/lib/deal-machine";
import { siteDate } from "@/lib/site-time";
import { cn } from "@/lib/utils";

/** The same day the certificate gives: India time, not the server's. */
const day = (date: Date) => siteDate(date);

/**
 * The end of a deal that went through: congratulations, in green, and the
 * certificate to keep.
 *
 * The owner asked for a finish people can feel, and for proof the buyer can
 * show later "if anything happens" — to a platform's support, or to anyone
 * who questions where the account came from. The certificate is for the two
 * people in the deal; the agent sees the congratulations only.
 */
export function DealComplete({
  dealId,
  reference,
  viewerRole,
  mode,
  platform,
  completedAt,
  code,
  className,
}: {
  dealId: string;
  reference: string;
  viewerRole: DealActor;
  mode: DealMode;
  /** Names what changed hands: "The Page is yours", not "The channel". */
  platform: Platform;
  completedAt: Date;
  /** The certificate's code, for the buyer and the seller. */
  code: string | null;
  className?: string;
}) {
  const buyer = viewerRole === "buyer";
  const seller = viewerRole === "seller";
  const { title, body } = completeWords(viewerRole, mode, platform);
  const certificate = (buyer || seller) && code;
  const href = `/dashboard/deals/${dealId}/certificate`;

  return (
    <section
      aria-labelledby="deal-complete-heading"
      className={cn(
        "rounded-card border border-verified/30 bg-verified-soft p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-verified text-bg shadow-xs">
          <PartyPopperIcon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2
            id="deal-complete-heading"
            className="text-base leading-6 font-semibold text-fg"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
          <p className="mt-1.5 text-xs text-subtle tabular-nums">
            Completed {day(completedAt)} · {reference}
          </p>
        </div>
      </div>

      {certificate ? (
        <div className="mt-4 border-t border-verified/20 pt-4">
          <div className="flex flex-wrap gap-2">
            {/* Files, not pages: plain links with `download`, so a phone
                saves them rather than trying to open a route. */}
            <Button
              asChild
              size="md"
              className="bg-verified text-bg hover:bg-verified/90 max-sm:flex-1"
            >
              <a href={href} download>
                <DownloadIcon aria-hidden="true" />
                Download certificate
              </a>
            </Button>
            <Button
              asChild
              size="md"
              variant="secondary"
              className="max-sm:flex-1"
            >
              <a href={`${href}?format=png`} download>
                <ImageIcon aria-hidden="true" />
                Save as image
              </a>
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Anyone can check it is genuine with code{" "}
            <Link
              href={`/certificate/${code}`}
              className="font-mono font-medium whitespace-nowrap text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg"
            >
              {code}
            </Link>
            .
          </p>
        </div>
      ) : null}
    </section>
  );
}
