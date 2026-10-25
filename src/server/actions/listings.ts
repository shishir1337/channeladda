"use server";

import { revalidatePath } from "next/cache";
import { needsEmailVerification } from "@/lib/email-verification";
import {
  fieldErrors,
  type ListingDraftInput,
  type ListingLiveEditInput,
  listingDraftSchema,
  listingLiveEditSchema,
  listingSubmitSchema,
} from "@/lib/listing-form";
import { LOCK_TEXT, VERIFIED_FACTS_NOTE } from "@/lib/listing-lock";
import * as repo from "@/server/seller-listings";
import {
  clearVerificationIfIdentityChanged,
  type LiveEditRefusal,
  type RemoveRefusal,
} from "@/server/seller-listings";
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

const EMAIL_FIRST = {
  ok: false as const,
  errors: {
    form: "Confirm your email address before sending a listing for review.",
  },
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

/**
 * Every page a buyer could read this listing on: its own page, browse, the
 * homepage showcase, and the seller's public page — the last two are cached
 * for a minute, which is a minute of the old price.
 */
function refreshPublic(slug: string, sellerSlug: string | null) {
  revalidatePath(`/listing/${slug}`);
  revalidatePath("/browse");
  revalidatePath("/browse/[platform]", "page");
  revalidatePath("/");
  if (sellerSlug) revalidatePath(`/seller/${sellerSlug}`);
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

  // A verified listing that a moderator rejected is editable again, so an
  // edit that changes *which account this is* has to drop the verification
  // with it. Otherwise one channel gets verified, the listing is rejected,
  // and it is re-pointed at a different channel while keeping the badge —
  // `checkOwnershipCode` short-circuits on "already verified" and never looks
  // again. Done before the write, so the identity being compared is the one
  // still on the row.
  await clearVerificationIfIdentityChanged(user.id, id, {
    sourceUrl: parsed.data.sourceUrl ?? null,
    handle: parsed.data.handle ?? null,
  });

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
  if (needsEmailVerification(user)) return EMAIL_FIRST;
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
    if (result.reason === "not-found") return NOT_YOURS;
    return {
      ok: false,
      errors: {
        form:
          result.reason === "in-deal"
            ? "A deal on this listing is still running. It can go back on sale once that deal is finished."
            : paused
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

const LIVE_EDIT_REFUSED: Record<LiveEditRefusal, string> = {
  "not-found": NOT_YOURS.errors.form,
  "wrong-status":
    "Only a live or paused listing is edited here. Open the listing to change a draft.",
  identity:
    "The platform, the handle and the account link cannot change on a live listing. To sell a different account, list it as a new one.",
  "verified-facts": VERIFIED_FACTS_NOTE,
  changed:
    "This listing changed while you were editing it, so nothing was saved. Open it again to see where it stands.",
  reserved: LOCK_TEXT.reserved.body,
  "in-deal": LOCK_TEXT["in-deal"].body,
  sold: LOCK_TEXT.sold.body,
  removed: "This listing is off the marketplace, so it cannot be edited.",
};

/**
 * An edit to a listing buyers can already see. It shows at once: there is
 * no second review, and staff see what changed in the listing's history.
 */
export async function saveLiveListing(
  id: string,
  input: ListingLiveEditInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = listingLiveEditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const result = await repo.updateLiveListing(user.id, id, parsed.data);
  if (!result.ok) {
    return { ok: false, errors: { form: LIVE_EDIT_REFUSED[result.reason] } };
  }

  refreshFor(id);
  if (result.changed.length > 0) refreshPublic(result.slug, user.slug);
  return { ok: true, id };
}

const REMOVE_REFUSED: Record<RemoveRefusal, string> = {
  "not-found": NOT_YOURS.errors.form,
  reserved: LOCK_TEXT.reserved.body,
  "in-deal": LOCK_TEXT["in-deal"].body,
  sold: LOCK_TEXT.sold.body,
  paying:
    "A buyer is paying for this listing by crypto right now. You can remove it once that payment lands or runs out, within the hour.",
  changed:
    "This listing changed while you were removing it, so nothing was done. Open it again to see where it stands.",
};

/**
 * "Remove listing", whatever stage it is at: a draft is deleted, anything
 * that has been sent leaves the marketplace for good. See `removeMyListing`.
 */
export async function removeListing(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await repo.removeMyListing(user.id, id);
  if (!result.ok) {
    return { ok: false, errors: { form: REMOVE_REFUSED[result.reason] } };
  }
  refreshFor(id);
  if (result.outcome === "removed") refreshPublic(result.slug, user.slug);
  return { ok: true };
}
