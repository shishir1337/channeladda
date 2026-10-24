import { ExternalLinkIcon, PhoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";

/**
 * The seller's WhatsApp, for staff.
 *
 * Collected on the listing so a transfer that stalls can be unstuck by
 * somebody phoning the seller, and never shown to a buyer — the product's
 * whole contact-redaction rule exists to stop deals walking off-platform. So
 * this lives in `components/admin` and nowhere a member page can import it by
 * accident, and it is only ever handed a number by a page that has already
 * passed a staff guard.
 *
 * `wa.me` wants the full international number as bare digits. The form asks
 * for the international form, but the stored value is whatever the seller
 * typed — spaces, brackets, a leading + — so the digits are pulled out here
 * and the number is still shown exactly as given, in case the link cannot
 * dial it.
 */
export function waMeHref(number: string): string | null {
  const digits = number.replace(/\D/g, "");
  // Shorter than any real international number: a link would dial nothing.
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}

export function WhatsAppContact({
  number,
  name,
}: {
  number: string | null;
  /** Whose number it is, for the link's accessible name. */
  name: string;
}) {
  if (!number) {
    return <span className="text-subtle">Not given on the listing</span>;
  }

  const href = waMeHref(number);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="tnum inline-flex items-center gap-1.5 text-fg select-all">
        <PhoneIcon
          aria-hidden="true"
          className={`size-3.5 shrink-0 ${iconText(PhoneIcon)}`}
        />
        {number}
      </span>
      {href ? (
        <Button asChild size="sm" variant="secondary">
          <a href={href} target="_blank" rel="noreferrer">
            Open in WhatsApp
            <span className="sr-only"> to message {name}</span>
            <ExternalLinkIcon aria-hidden="true" />
          </a>
        </Button>
      ) : null}
    </span>
  );
}
