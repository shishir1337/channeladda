"use client";

import {
  ActivityIcon,
  ArrowLeftRightIcon,
  BanknoteIcon,
  ImagePlusIcon,
  Loader2Icon,
  LockIcon,
  TagIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Card, CardBody, CardHeader, labelClass } from "@/components/app/kit";
import { FormNotice, TextArea, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/upload/image-upload";
import { type FeeSettings, quote } from "@/lib/fees";
import type { ListingLiveEditInput } from "@/lib/listing-form";
import { VERIFIED_FACTS_CHECKED } from "@/lib/listing-lock";
import { supportHref } from "@/lib/support";
import { saveLiveListing } from "@/server/actions/listings";

/** The form's own copy of the fields, as typed: numbers stay strings. */
export type LiveListingValues = {
  title: string;
  niche: string;
  country: string;
  description: string;
  audience: string;
  engagement: string;
  ageYears: string;
  monetized: boolean;
  monthlyRevenue: string;
  yearlyRevenue: string;
  price: string;
  coverUrl: string | null;
  avatarUrl: string | null;
  transferProfile: string;
  whatsapp: string;
};

/** 48200 as "48,200". */
function whole(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : value;
}

/** A figure in a locked field: digits that line up. */
function Figure({ children }: { children: ReactNode }) {
  return <span className="tabular-nums">{children}</span>;
}

/** "" and a stray "12abc" both have to become something zod will reject. */
function num(value: string) {
  if (value.trim() === "") return Number.NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function money(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Each field the server can refuse, in the words on screen, in order. */
const FIELD_LABEL: Record<string, string> = {
  title: "Listing title",
  niche: "Niche",
  country: "Main audience country",
  description: "About this account",
  price: "Asking price",
  coverUrl: "Cover image",
  avatarUrl: "Profile picture",
  transferProfile: "Anything specific about this account",
  whatsapp: "WhatsApp number",
};

/**
 * A value the seller can see but not change, and why not.
 *
 * Shaped like the field it stands in for, so the form reads as one form, but
 * flat and grey with a lock, so nobody taps it expecting a keyboard.
 */
function LockedField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <p className="mt-1.5 flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted pointer-fine:min-h-9 dark:bg-surface-3">
        <LockIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-subtle"
        />
        <span className="min-w-0 break-all">{value}</span>
      </p>
    </div>
  );
}

/**
 * Editing a listing buyers can already see.
 *
 * Shorter than the listing form on purpose: there is no progress to track,
 * no proof to add and no ownership code to place — the listing is past all
 * of that. It is the parts a buyer reads, and one Save that puts them in
 * front of buyers at once.
 *
 * The numbers are shown, not edited: a moderator checked them against the
 * proof before approving the listing, and they change only through support
 * (`VERIFIED_FACTS`). The server refuses a change to them either way.
 */
export function LiveListingForm({
  listingId,
  initial,
  account,
  fees,
}: {
  listingId: string;
  initial: LiveListingValues;
  /** Which account this is. Shown, never sent. */
  account: {
    platform: string;
    handle: string;
    link: string | null;
    metricLabel: string;
    transferNote?: string;
  };
  /** Current rates, read on the server. */
  fees: FeeSettings;
}) {
  const router = useRouter();
  const ids = {
    title: useId(),
    niche: useId(),
    country: useId(),
    description: useId(),
    price: useId(),
    transferProfile: useId(),
    whatsapp: useId(),
  };

  const [values, setValues] = useState<LiveListingValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failures, setFailures] = useState(0);
  const [pending, startTransition] = useTransition();
  const noticeRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof LiveListingValues>(
    key: K,
    value: LiveListingValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const price = num(values.price);
  const payout =
    Number.isFinite(price) && price > 0
      ? quote(price, fees, "FASTEST").payout
      : null;

  // In an effect, not straight after the save: inside a transition the
  // messages are not on the page yet when the action returns. Focus goes to
  // the notice, which names every field to fix and is read out.
  useEffect(() => {
    if (failures === 0) return;
    const node = noticeRef.current;
    if (!node) return;
    node.focus();
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [failures]);

  // The checked figures are not sent: they are not this form's to change.
  // The handle is, unchanged, so the account's own name may appear in the
  // words without reading as somebody else's contact details.
  function toInput(): ListingLiveEditInput {
    return {
      handle: account.handle,
      title: values.title,
      niche: values.niche,
      country: values.country,
      description: values.description,
      price,
      coverUrl: values.coverUrl ?? "",
      avatarUrl: values.avatarUrl ?? "",
      transferProfile: values.transferProfile,
      whatsapp: values.whatsapp,
    };
  }

  function save() {
    setErrors({});
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveLiveListing>>;
      try {
        result = await saveLiveListing(listingId, toInput());
      } catch {
        result = {
          ok: false,
          errors: {
            form: "We could not reach Channel Adda, so nothing was saved. Check your connection and press Save again. Everything you typed is still here.",
          },
        };
      }
      if (!result.ok) {
        setErrors(result.errors);
        setFailures((n) => n + 1);
        return;
      }
      router.push(`/dashboard/listings/${listingId}?saved=1`);
      router.refresh();
    });
  }

  const toFix = Object.keys(FIELD_LABEL).filter((key) => errors[key]);

  return (
    <form
      noValidate
      className="flex flex-col gap-4 sm:gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {Object.keys(errors).length > 0 ? (
        /* tabIndex -1: focus is moved here after a failed save, so the
           message is announced. Not reachable by tabbing. */
        <div ref={noticeRef} tabIndex={-1} className="rounded-card">
          <FormNotice>
            {errors.form ??
              (toFix.length > 0
                ? `Fix ${toFix.length === 1 ? "this field" : "these fields"}, marked in red below: ${toFix
                    .map((key) => FIELD_LABEL[key])
                    .join(", ")}.`
                : "That did not save. Check the form and press Save again.")}
          </FormNotice>
        </div>
      ) : null}

      <Card>
        <CardHeader
          as="h2"
          icon={LockIcon}
          title="The account"
          description="These cannot change."
          info="They say which account buyers are getting, and they are what proved it is yours. A different account needs a listing of its own."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <LockedField label="Platform" value={account.platform} />
          <LockedField label="Handle" value={account.handle} />
          {account.link ? (
            <div className="sm:col-span-2">
              <LockedField label="Account link" value={account.link} />
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" icon={TagIcon} title="What buyers read" />
        <CardBody className="flex flex-col gap-5">
          <div>
            <TextField
              id={ids.title}
              name="title"
              label="Listing title"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              error={errors.title}
              required
            />
            <p className="mt-1.5 text-xs text-subtle">
              <span className="tabular-nums">{values.title.length}</span> of 120
              characters.
            </p>
          </div>
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <TextField
              id={ids.niche}
              name="niche"
              label="Niche"
              value={values.niche}
              onChange={(e) => set("niche", e.target.value)}
              error={errors.niche}
              required
            />
            <TextField
              id={ids.country}
              name="country"
              label="Main audience country"
              hint='"Global" is fine if it is spread out.'
              value={values.country}
              onChange={(e) => set("country", e.target.value)}
              error={errors.country}
              required
            />
          </div>
          <div>
            <TextArea
              id={ids.description}
              name="description"
              label="About this account (optional)"
              hint="What it is, who watches it, how it earns, and anything a buyer would be annoyed to find out later."
              rows={6}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              error={errors.description}
            />
            <p className="mt-1.5 text-xs text-subtle">
              <span className="tabular-nums">{values.description.length}</span>{" "}
              of 4,000 characters.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" icon={ActivityIcon} title="The numbers" />
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <LockedField
              label={account.metricLabel}
              value={<Figure>{whole(initial.audience)}</Figure>}
            />
            <LockedField
              label="Engagement rate"
              value={<Figure>{`${initial.engagement}%`}</Figure>}
            />
            <LockedField
              label="Account age"
              value={
                <Figure>
                  {Number(initial.ageYears) === 1
                    ? "1 year"
                    : `${whole(initial.ageYears)} years`}
                </Figure>
              }
            />
            <LockedField
              label="Monetized"
              value={initial.monetized ? "Yes" : "No"}
            />
            {initial.monetized ? (
              <>
                <LockedField
                  label="Monthly revenue"
                  value={
                    <Figure>{money(Number(initial.monthlyRevenue))}</Figure>
                  }
                />
                <LockedField
                  label="Last 12 months"
                  value={
                    <Figure>{money(Number(initial.yearlyRevenue))}</Figure>
                  }
                />
              </>
            ) : null}
          </div>
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            {VERIFIED_FACTS_CHECKED} To change them,{" "}
            <Link
              href={supportHref("Changing a live listing")}
              className="font-medium text-fg underline decoration-line-strong underline-offset-2 transition-colors hover:decoration-fg"
            >
              contact support
            </Link>
            .
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" icon={BanknoteIcon} title="Price" />
        <CardBody className="flex flex-col gap-3">
          <TextField
            id={ids.price}
            name="price"
            label="Asking price (USD)"
            hint="Deals that are already open keep the price they opened at."
            className="sm:max-w-xs"
            inputMode="decimal"
            value={values.price}
            onChange={(e) => set("price", e.target.value)}
            error={errors.price}
            required
          />
          {payout !== null ? (
            <p className="text-[0.8125rem] text-muted">
              On a Fastest deal,{" "}
              <span className="font-medium text-verified tabular-nums">
                {money(payout)}
              </span>{" "}
              reaches your Channel Adda balance.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader as="h2" icon={ImagePlusIcon} title="Images" />
        <CardBody className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <ImageUpload
            kind="cover"
            label="Cover image"
            hint="Wide. A channel banner or a screenshot of the feed works well."
            value={values.coverUrl}
            onChange={(url) => set("coverUrl", url)}
            error={errors.coverUrl}
          />
          <ImageUpload
            kind="avatar"
            aspect="square"
            label="Profile picture"
            hint="Square. The account's own avatar."
            value={values.avatarUrl}
            onChange={(url) => set("avatarUrl", url)}
            error={errors.avatarUrl}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          as="h2"
          icon={ArrowLeftRightIcon}
          title="Handover"
          description={account.transferNote}
        />
        <CardBody className="flex flex-col gap-5">
          <TextField
            id={ids.transferProfile}
            name="transferProfile"
            label="Anything specific about this account (optional)"
            hint="For example: sits on a Brand Account, or the domain is at Cloudflare."
            value={values.transferProfile}
            onChange={(e) => set("transferProfile", e.target.value)}
            error={errors.transferProfile}
          />
          <TextField
            id={ids.whatsapp}
            name="whatsapp"
            label="WhatsApp number (Channel Adda only)"
            hint="Never shown to buyers."
            className="sm:max-w-sm"
            inputMode="tel"
            value={values.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
            error={errors.whatsapp}
            placeholder="+8801712345678"
          />
        </CardBody>
      </Card>

      {/* Follows the page down, as the listing form's does: on a phone the
          form is long and the one button should never be a scroll away. It
          sits above the phone's tab bar, as one row of buttons. */}
      <div className="sticky bottom-[calc(4.375rem+env(safe-area-inset-bottom))] z-10 rounded-card border border-line bg-bg/85 p-2.5 shadow-lift backdrop-blur-xl sm:py-2.5 sm:pr-2.5 sm:pl-4 lg:bottom-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted max-sm:hidden sm:text-[0.8125rem]">
            Buyers see your changes as soon as you save.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="ghost" size="md" className="flex-none">
              <Link href={`/dashboard/listings/${listingId}`}>Cancel</Link>
            </Button>
            <Button
              type="submit"
              size="md"
              className="min-w-0 flex-1 sm:flex-none sm:min-w-[9rem]"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2Icon aria-hidden="true" className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
