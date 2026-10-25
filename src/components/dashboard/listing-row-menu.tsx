"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  EllipsisIcon,
  Loader2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { setPaused } from "@/server/actions/listings";

/** One row of the menu: 44px on a finger, the desktop size on a mouse. */
const item =
  "flex h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[0.8125rem] text-muted outline-none select-none transition-colors pointer-fine:h-8 data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg data-[disabled]:cursor-default data-[disabled]:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle data-[highlighted]:[&_svg]:text-fg";

/**
 * Edit, pause or resume, and remove for one row of "Your listings", without
 * opening it first.
 *
 * Pause and resume happen here, at once: neither loses anything, and resume
 * puts back exactly what was there. The menu stays open while it works, and
 * says so in it if it could not.
 *
 * Remove leads to the listing's own page with its question already open, so
 * what removing does — which offers and deals it closes — is read in one
 * place, beside the listing it is about, rather than in a menu.
 */
export function ListingRowMenu({
  listingId,
  name,
  editHref,
  canRemove,
  pause = null,
}: {
  listingId: string;
  /** What the row is called, so the button is named for it. */
  name: string;
  /** Null when it cannot be edited right now. */
  editHref: string | null;
  canRemove: boolean;
  /** Which of the two it can do now, if either. */
  pause?: "pause" | "resume" | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function togglePause(event: Event) {
    // Kept open until it is done: a menu that closes on a tap and then
    // changes nothing for a second reads as a tap that missed.
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await setPaused(listingId, pause === "pause");
      if (!result.ok) {
        setError(result.errors.form ?? "That did not work. Try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <DropdownMenu.Root
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DropdownMenu.Trigger
        aria-label={`Actions for ${name}`}
        className={cn(
          "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-subtle outline-none transition-colors duration-150 pointer-fine:size-8",
          "hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-surface-2 data-[state=open]:text-fg",
        )}
      >
        <EllipsisIcon aria-hidden="true" className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="z-50 w-52 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-lg border border-line bg-surface p-1 shadow-lift data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          {editHref ? (
            <DropdownMenu.Item asChild>
              <Link href={editHref} className={item}>
                <PencilIcon aria-hidden="true" />
                Edit
              </Link>
            </DropdownMenu.Item>
          ) : null}
          {pause ? (
            <DropdownMenu.Item
              className={item}
              disabled={pending}
              onSelect={togglePause}
            >
              {pending ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : pause === "pause" ? (
                <PauseIcon aria-hidden="true" />
              ) : (
                <PlayIcon aria-hidden="true" />
              )}
              {pending
                ? pause === "pause"
                  ? "Pausing…"
                  : "Putting it back up…"
                : pause === "pause"
                  ? "Pause listing"
                  : "Put it back up"}
            </DropdownMenu.Item>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="px-2 py-1.5 text-xs leading-relaxed text-danger"
            >
              {error}
            </p>
          ) : null}
          {canRemove ? (
            <>
              {editHref || pause ? (
                <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />
              ) : null}
              <DropdownMenu.Item asChild>
                <Link
                  href={`/dashboard/listings/${listingId}?remove=1`}
                  className={cn(
                    item,
                    "text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger [&_svg]:text-danger data-[highlighted]:[&_svg]:text-danger",
                  )}
                >
                  <TrashIcon aria-hidden="true" />
                  Remove listing
                </Link>
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
