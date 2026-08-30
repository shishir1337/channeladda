"use server";

import { revalidatePath } from "next/cache";
import {
  fieldErrors,
  type ListingDraftInput,
  listingDraftSchema,
  listingSubmitSchema,
} from "@/lib/listing-form";
import * as repo from "@/server/seller-listings";
import { requireUser } from "@/server/session";

/**
 * Everything a seller can do to their own listings.
 *
 * Two rules hold across all of it:
 *
 * 1. The session decides who the seller is. `sellerId` is never taken from the
 *    request — if it were, changing one field in a form submission would let
 *    anyone edit anyone's listing.
 * 2. The input is validated here even though the form validates it too. The
 *    browser copy is there to be helpful; this one is the one that counts.
 */

export type ActionResult =
  | { ok: true; id?: string; code?: string }
  | { ok: false; errors: Record<string, string> };

const NOT_YOURS = {
  ok: false as const,
  errors: { form: "That listing could not be found." },
};

const LOCKED = {
  ok: false as const,
  errors: {
    form: "This listing is being reviewed, so it cannot be changed right now.",
  },
};

function refreshFor(id?: string) {
  revalidatePath("/dashboard/listings");
  if (id) revalidatePath(`/dashboard/listings/${id}`);
}

export async function saveListing(
  id: string | null,
  input: ListingDraftInput,
  submit: boolean,
): Promise<ActionResult> {
  const user = await requireUser();

  // Submitting asks for more than saving does — a draft may be half-finished,
  // a listing about to face buyers may not.
  const schema = submit ? listingSubmitSchema : listingDraftSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  if (!id) {
    const newId = await repo.createDraft(user.id, parsed.data);
    if (submit) {
      const started = await repo.startOwnershipCheck(user.id, newId);
      refreshFor(newId);
      return started.ok
        ? { ok: true, id: newId, code: started.code }
        : { ok: true, id: newId };
    }
    refreshFor(newId);
    return { ok: true, id: newId };
  }

  const updated = await repo.updateDraft(user.id, id, parsed.data);
  if (!updated.ok) return updated.reason === "locked" ? LOCKED : NOT_YOURS;

  if (submit) {
    const started = await repo.startOwnershipCheck(user.id, id);
    refreshFor(id);
    return started.ok ? { ok: true, id, code: started.code } : LOCKED;
  }

  refreshFor(id);
  return { ok: true, id };
}

/** The seller confirms the code is live on their profile. */
export async function submitForReview(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await repo.submitForReview(user.id, id);
  if (!result.ok) {
    if (result.reason === "not-found") return NOT_YOURS;
    if (result.reason === "no-proof") {
      return {
        ok: false,
        errors: {
          form: "Add at least one screenshot proving the account is yours before sending this for review.",
        },
      };
    }
    return {
      ok: false,
      errors: { form: "Place the ownership code first, then send for review." },
    };
  }
  refreshFor(id);
  return { ok: true, id };
}

export async function withdrawFromReview(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await repo.withdrawFromReview(user.id, id);
  if (!result.ok) {
    return result.reason === "not-found"
      ? NOT_YOURS
      : {
          ok: false,
          errors: { form: "This listing is not waiting for review." },
        };
  }
  refreshFor(id);
  return { ok: true, id };
}

export async function setPaused(
  id: string,
  paused: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  const result = await repo.setPaused(user.id, id, paused);
  if (!result.ok) {
    return result.reason === "not-found"
      ? NOT_YOURS
      : {
          ok: false,
          errors: {
            form: paused
              ? "Only a live listing can be paused."
              : "Only a paused listing can be resumed.",
          },
        };
  }
  refreshFor(id);
  // A pause changes what buyers see.
  revalidatePath("/browse");
  return { ok: true, id };
}

export async function deleteListing(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await repo.deleteDraft(user.id, id);
  if (!result.ok) {
    return result.reason === "locked"
      ? {
          ok: false,
          errors: {
            form: "Only a draft can be deleted. Pause it instead if it is live.",
          },
        }
      : NOT_YOURS;
  }
  revalidatePath("/dashboard/listings");
  return { ok: true };
}
