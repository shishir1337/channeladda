"use client";

import { ShieldCheckIcon, XIcon } from "lucide-react";
import { useState } from "react";

export function AnnouncementBar() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="relative border-b border-line bg-surface-2">
      <div className="mx-auto flex w-full max-w-[81rem] items-center justify-center gap-2.5 px-10 py-2.5 text-center sm:px-14">
        <ShieldCheckIcon
          aria-hidden="true"
          className="hidden size-4 shrink-0 text-verified sm:block"
        />
        <p className="text-[0.8125rem] leading-snug text-muted">
          Every deal is escrow-protected.{" "}
          <span className="text-fg">
            Funds release only after you confirm the handover.
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss announcement"
        className="absolute top-1/2 right-1 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:text-fg sm:right-3"
      >
        <XIcon aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
