"use client";

import { ShieldCheckIcon, XIcon } from "lucide-react";
import { useState } from "react";

export function AnnouncementBar() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="relative border-b border-line bg-bg-subtle">
      <div className="mx-auto flex w-full max-w-[81rem] items-center justify-center gap-2 px-10 py-2 text-center sm:px-14">
        <ShieldCheckIcon
          aria-hidden="true"
          className="hidden size-3.5 shrink-0 text-verified sm:block"
        />
        {/* One line on a phone: four lines of banner pushed the page itself
            below the fold. */}
        <p className="text-[0.8125rem] leading-snug text-muted">
          <span className="text-fg">
            Every deal is protected by a Channel Adda agent.
          </span>
          <span className="hidden sm:inline">
            {" "}
            We hold your money or the account until the handover is done.
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss announcement"
        className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors duration-150 hover:text-fg sm:right-3"
      >
        <XIcon aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}
