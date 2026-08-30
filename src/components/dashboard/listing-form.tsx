"use client";

import { PlusIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormNotice, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/upload/image-upload";
import { type FeeSettings, formatRate, quote } from "@/lib/fees";
import type { ListingDraftInput, PLATFORM_IDS } from "@/lib/listing-form";
import { cn } from "@/lib/utils";
import { saveListing } from "@/server/actions/listings";

type Proof = { url: string; label: string; sha256: string };

export type PlatformChoice = {
  id: (typeof PLATFORM_IDS)[number];
  name: string;
  metricLabel: string;
  transferNote: string;
};

type Draft = {
  platform: string;
  handle: string;
  title: string;
  niche: string;
  country: string;
  audience: string;
  monetized: boolean;
  monthlyRevenue: string;
  engagement: string;
  ageYears: string;
  price: string;
  coverUrl: string | null;
  avatarUrl: string | null;
  transferProfile: string;
  proofs: Proof[];
};

const EMPTY: Draft = {
  platform: "youtube",
  handle: "",
  title: "",
  niche: "",
  country: "",
  audience: "",
  monetized: false,
  monthlyRevenue: "0",
  engagement: "",
  ageYears: "",
  price: "",
  coverUrl: null,
  avatarUrl: null,
  transferProfile: "",
  proofs: [],
};

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
    maximumFractionDigits: 0,
  });
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">{title}</h2>
      {description ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function ListingForm({
  platforms,
  listingId,
  initial,
  fees,
}: {
  platforms: PlatformChoice[];
  listingId: string | null;
  initial?: Partial<Draft>;
  /** Current rates, read on the server. Never a constant in here. */
  fees: FeeSettings;
}) {
  const router = useRouter();
  const ids = {
    handle: useId(),
    title: useId(),
    niche: useId(),
    country: useId(),
    audience: useId(),
    engagement: useId(),
    age: useId(),
    revenue: useId(),
    price: useId(),
    transfer: useId(),
    monetized: useId(),
  };

  const [draft, setDraft] = useState<Draft>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const platform =
    platforms.find((p) => p.id === draft.platform) ?? platforms[0];

  const priceNumber = num(draft.price);
  const showPayout = Number.isFinite(priceNumber) && priceNumber > 0;
  const preview = showPayout ? quote(priceNumber, fees) : null;

  function toInput(): ListingDraftInput {
    return {
      platform: draft.platform as ListingDraftInput["platform"],
      handle: draft.handle,
      title: draft.title,
      niche: draft.niche,
      country: draft.country,
      audience: num(draft.audience),
      monetized: draft.monetized,
      monthlyRevenue: num(draft.monthlyRevenue),
      engagement: num(draft.engagement),
      ageYears: num(draft.ageYears),
      price: priceNumber,
      // The uploader hands back a URL or nothing; "" makes zod produce the
      // "Add a cover image" message rather than a type complaint.
      coverUrl: draft.coverUrl ?? "",
      avatarUrl: draft.avatarUrl ?? "",
      transferProfile: draft.transferProfile,
      proofs: draft.proofs,
    };
  }

  function submit(forReview: boolean) {
    setErrors({});
    startTransition(async () => {
      const result = await saveListing(listingId, toInput(), forReview);
      if (!result.ok) {
        setErrors(result.errors);
        // Send them to the first thing that is wrong rather than leaving them
        // to hunt for it in a long form.
        const first = document.querySelector(
          "[aria-invalid='true'], [role='alert']",
        );
        first?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      router.push(`/dashboard/listings/${result.id}`);
      router.refresh();
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      {errors.form ? <FormNotice>{errors.form}</FormNotice> : null}

      <Section
        title="What are you selling?"
        description="This is what buyers search and filter on, so be specific."
      >
        <fieldset>
          <legend className="text-sm font-medium text-fg">Platform</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {platforms.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set("platform", p.id)}
                aria-pressed={draft.platform === p.id}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 text-sm font-medium transition-colors",
                  draft.platform === p.id
                    ? "border-primary bg-primary-soft text-primary-text"
                    : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          {errors.platform ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {errors.platform}
            </p>
          ) : null}
        </fieldset>

        <TextField
          id={ids.handle}
          name="handle"
          label="Handle"
          hint="Without the URL — just the name, for example @dailytechbrief."
          value={draft.handle}
          onChange={(e) => set("handle", e.target.value)}
          error={errors.handle}
          placeholder="@dailytechbrief"
          required
        />
        <TextField
          id={ids.title}
          name="title"
          label="Listing title"
          hint="What a buyer sees first. Say what it is and why it is worth having."
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          error={errors.title}
          placeholder="Monetized tech review channel with 4 years of watch time"
          required
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id={ids.niche}
            name="niche"
            label="Niche"
            value={draft.niche}
            onChange={(e) => set("niche", e.target.value)}
            error={errors.niche}
            placeholder="Technology"
            required
          />
          <TextField
            id={ids.country}
            name="country"
            label="Main audience country"
            hint='"Global" is fine if it is spread out.'
            value={draft.country}
            onChange={(e) => set("country", e.target.value)}
            error={errors.country}
            placeholder="United States"
            required
          />
        </div>
      </Section>

      <Section
        title="The numbers"
        description="Buyers will check these against the screenshots you upload below, so put down what is actually there."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id={ids.audience}
            name="audience"
            label={platform?.metricLabel ?? "Audience"}
            inputMode="numeric"
            value={draft.audience}
            onChange={(e) => set("audience", e.target.value)}
            error={errors.audience}
            placeholder="128000"
            required
          />
          <TextField
            id={ids.engagement}
            name="engagement"
            label="Engagement rate (%)"
            hint="Average, over the last 30 days."
            inputMode="decimal"
            value={draft.engagement}
            onChange={(e) => set("engagement", e.target.value)}
            error={errors.engagement}
            placeholder="7.4"
            required
          />
          <TextField
            id={ids.age}
            name="ageYears"
            label="Account age (years)"
            inputMode="numeric"
            value={draft.ageYears}
            onChange={(e) => set("ageYears", e.target.value)}
            error={errors.ageYears}
            placeholder="4"
            required
          />
          <TextField
            id={ids.revenue}
            name="monthlyRevenue"
            label="Monthly revenue (USD)"
            hint="Zero if it does not earn yet."
            inputMode="decimal"
            value={draft.monthlyRevenue}
            onChange={(e) => set("monthlyRevenue", e.target.value)}
            error={errors.monthlyRevenue}
            placeholder="0"
          />
        </div>

        <label
          htmlFor={ids.monetized}
          className="flex cursor-pointer items-start gap-3 text-sm text-muted"
        >
          <input
            id={ids.monetized}
            type="checkbox"
            checked={draft.monetized}
            onChange={(e) => set("monetized", e.target.checked)}
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
          />
          <span>
            This account is monetized.
            <span className="block text-xs text-subtle">
              Claiming this when it is not is the fastest way to have a listing
              rejected.
            </span>
          </span>
        </label>
      </Section>

      <Section title="Price">
        <TextField
          id={ids.price}
          name="price"
          label="Asking price (USD)"
          inputMode="decimal"
          value={draft.price}
          onChange={(e) => set("price", e.target.value)}
          error={errors.price}
          placeholder="4500"
          required
        />
        {preview ? (
          <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            <div className="bg-surface-2 p-4">
              <dt className="text-xs text-subtle">Buyer pays</dt>
              <dd className="mt-1 font-display text-lg font-bold text-fg">
                {money(preview?.total ?? 0)}
              </dd>
            </div>
            <div className="bg-surface-2 p-4">
              <dt className="text-xs text-subtle">
                Our fee ({formatRate(fees.sellerFeeBp)}%)
              </dt>
              <dd className="mt-1 font-display text-lg font-bold text-muted">
                −{money(preview?.sellerFee ?? 0)}
              </dd>
            </div>
            <div className="bg-surface-2 p-4">
              <dt className="text-xs text-subtle">You receive</dt>
              <dd className="mt-1 font-display text-lg font-bold text-verified">
                {money(preview?.payout ?? 0)}
              </dd>
            </div>
          </dl>
        ) : null}
      </Section>

      <Section
        title="Images"
        description="A cover for the listing card and a profile picture for the account itself."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <ImageUpload
            kind="cover"
            label="Cover image"
            hint="Wide. A channel banner or a screenshot of the feed works well."
            value={draft.coverUrl}
            onChange={(url) => set("coverUrl", url)}
          />
          <ImageUpload
            kind="avatar"
            aspect="square"
            label="Profile picture"
            hint="Square. The account's own avatar."
            value={draft.avatarUrl}
            onChange={(url) => set("avatarUrl", url)}
          />
        </div>
        {errors.coverUrl ? (
          <p role="alert" className="text-sm text-danger">
            {errors.coverUrl}
          </p>
        ) : null}
        {errors.avatarUrl ? (
          <p role="alert" className="text-sm text-danger">
            {errors.avatarUrl}
          </p>
        ) : null}
      </Section>

      <Section
        title="Proof"
        description="Screenshots from inside the account — analytics, revenue, the account settings page. This is what a moderator checks the numbers against."
      >
        {draft.proofs.map((proof, i) => (
          <div
            key={proof.url}
            className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-2 p-3"
          >
            {/* biome-ignore lint/performance/noImgElement: a thumbnail of the
                seller's own upload. next/image would send their file back
                through the optimiser to draw it at 64px. */}
            <img
              src={proof.url}
              alt=""
              width={64}
              height={64}
              className="size-16 shrink-0 rounded-lg border border-line object-cover"
            />
            <label className="min-w-[12rem] flex-1 text-sm">
              <span className="sr-only">What this screenshot shows</span>
              <input
                value={proof.label}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    proofs: d.proofs.map((p, j) =>
                      j === i ? { ...p, label: e.target.value } : p,
                    ),
                  }))
                }
                placeholder="e.g. Last 28 days of revenue"
                className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  proofs: d.proofs.filter((_, j) => j !== i),
                }))
              }
              aria-label={`Remove screenshot ${i + 1}`}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl border border-line text-muted transition-colors hover:border-danger/50 hover:text-danger"
            >
              <TrashIcon aria-hidden="true" className="size-4" />
            </button>
          </div>
        ))}

        {draft.proofs.length < 8 ? (
          <ImageUpload
            kind="proof"
            label={
              draft.proofs.length === 0
                ? "Add a screenshot"
                : "Add another screenshot"
            }
            hint="Up to eight."
            value={null}
            onChange={(_url, file) => {
              if (!file) return;
              setDraft((d) => ({
                ...d,
                proofs: [
                  ...d.proofs,
                  { url: file.url, label: "", sha256: file.sha256 },
                ],
              }));
            }}
          />
        ) : (
          <p className="text-sm text-subtle">
            <PlusIcon aria-hidden="true" className="mr-1 inline size-4" />
            That is the maximum of eight.
          </p>
        )}

        {errors.proofs ? (
          <p role="alert" className="text-sm text-danger">
            {errors.proofs}
          </p>
        ) : null}
      </Section>

      <Section
        title="How the handover works"
        description={platform?.transferNote}
      >
        <TextField
          id={ids.transfer}
          name="transferProfile"
          label="Anything specific about this account (optional)"
          hint="For example: sits on a Brand Account, or the domain is at Cloudflare."
          value={draft.transferProfile}
          onChange={(e) => set("transferProfile", e.target.value)}
          error={errors.transferProfile}
          placeholder="Brand Account, 2FA on the owner email"
        />
      </Section>

      <div className="flex flex-wrap gap-3 pb-4">
        <Button type="submit" variant="secondary" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
        <Button
          type="button"
          size="md"
          disabled={pending}
          onClick={() => submit(true)}
        >
          {pending ? "Saving…" : "Save and verify ownership"}
        </Button>
      </div>
    </form>
  );
}
