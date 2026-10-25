"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { EllipsisIcon, PencilIcon, TrashIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** One row of the menu: 44px on a finger, the desktop size on a mouse. */
const item =
  "flex h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[0.8125rem] text-muted outline-none select-none transition-colors pointer-fine:h-8 data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle data-[highlighted]:[&_svg]:text-fg";

/**
 * Edit and Remove for one row of "Your listings", without opening it first.
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
}: {
  listingId: string;
  /** What the row is called, so the button is named for it. */
  name: string;
  /** Null when it cannot be edited right now. */
  editHref: string | null;
  canRemove: boolean;
}) {
  return (
    <DropdownMenu.Root modal={false}>
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
          className="z-50 w-48 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-lg border border-line bg-surface p-1 shadow-lift data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          {editHref ? (
            <DropdownMenu.Item asChild>
              <Link href={editHref} className={item}>
                <PencilIcon aria-hidden="true" />
                Edit
              </Link>
            </DropdownMenu.Item>
          ) : null}
          {canRemove ? (
            <>
              {editHref ? (
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
