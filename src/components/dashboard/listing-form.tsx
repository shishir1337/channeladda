"use client";

import {
  ActivityIcon,
  ArrowLeftRightIcon,
  BanknoteIcon,
  CameraIcon,
  CheckIcon,
  CircleAlertIcon,
  ImagePlusIcon,
  LinkIcon,
  Loader2Icon,
  LockIcon,
  TagIcon,
  TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { FormNotice, TextArea, TextField } from "@/components/auth/fields";
import {
  ChannelImport,
  type ImportedChannel,
} from "@/components/dashboard/channel-import";
import { Badge } from "@/components/ui/badge";
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
  yearlyRevenue: string;
  engagement: string;
  ageYears: string;
  price: string;
  coverUrl: string | null;
  avatarUrl: string | null;
  transferProfile: string;
  sourceUrl: string;
  description: string;
  whatsapp: string;
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
  yearlyRevenue: "0",
  engagement: "",
  ageYears: "",
  price: "",
  coverUrl: null,
  avatarUrl: null,
  transferProfile: "",
  sourceUrl: "",
  description: "",
  whatsapp: "",
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

/** Anchor ids for the sections. Static: there is one of this form per page. */
const STEP = {
  basics: "step-basics",
  numbers: "step-numbers",
  price: "step-price",
  images: "step-images",
  proof: "step-proof",
  handover: "step-handover",
} as const;

/**
 * Every field a zod failure can be keyed on, in the words used on screen.
 *
 * The error summary is built from this rather than from the keys themselves,
 * because `proofs.0.label` is not a thing a seller can look for.
 */
const FIELD_LABELS: Record<string, string> = {
  platform: "Platform",
  handle: "Handle",
  title: "Listing title",
  niche: "Niche",
  country: "Main audience country",
  audience: "Audience size",
  engagement: "Engagement rate",
  ageYears: "Account age",
  monthlyRevenue: "Monthly revenue",
  yearlyRevenue: "Last 12 months",
  monetized: "Monetized",
  price: "Asking price",
  coverUrl: "Cover image",
  avatarUrl: "Profile picture",
  proofs: "Screenshots",
  transferProfile: "About this account's setup",
  description: "About this account",
  whatsapp: "WhatsApp number",
  sourceUrl: "Channel link",
};

function proofIndex(key: string): number | null {
  const match = key.match(/^proofs\.(\d+)\./);
  return match ? Number(match[1]) : null;
}

function labelForError(key: string) {
  const direct = FIELD_LABELS[key];
  if (direct) return direct;
  const index = proofIndex(key);
  if (index !== null) return `Screenshot ${index + 1}`;
  return "This listing";
}

/** Scrolls to whatever is wrong and puts the cursor in it. */
function focusTarget(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLButtonElement
  ) {
    el.focus({ preventScroll: true });
  }
}

type StepState = "done" | "todo" | "error" | "optional";

/** One numbered block of the form. */
function FormSection({
  id,
  step,
  of,
  title,
  description,
  icon: Icon,
  state,
  statusLabel,
  children,
}: {
  id: string;
  step: number;
  of: number;
  title: string;
  description?: ReactNode;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  state: StepState;
  statusLabel: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-panel border bg-surface",
        state === "error" ? "border-danger/40" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-3.5 sm:px-6 sm:py-4">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl border",
            state === "done"
              ? "border-verified/30 bg-verified-soft text-verified"
              : state === "error"
                ? "border-danger/30 bg-danger-soft text-danger"
                : "border-line bg-surface text-muted",
          )}
        >
          <Icon aria-hidden="true" className="size-[1.15rem]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
            Step <span className="tnum">{step}</span> of{" "}
            <span className="tnum">{of}</span>
          </p>
          <h2
            id={`${id}-title`}
            className="font-display text-base font-bold text-fg sm:text-lg"
          >
            {title}
          </h2>
        </div>
        <Badge
          variant={
            state === "done"
              ? "verified"
              : state === "error"
                ? "danger"
                : "neutral"
          }
          size="md"
        >
          {state === "done" ? (
            <CheckIcon aria-hidden="true" />
          ) : state === "error" ? (
            <CircleAlertIcon aria-hidden="true" />
          ) : null}
          {statusLabel}
        </Badge>
      </div>

      <div className="px-4 py-5 sm:px-6">
        {description ? (
          <p className="max-w-[68ch] text-sm leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
        <div className={cn("flex flex-col gap-5", description && "mt-5")}>
          {children}
        </div>
      </div>
    </section>
  );
}

/** A submit-only requirement, ticked or not. */
function Requirement({
  done,
  label,
  target,
}: {
  done: boolean;
  label: string;
  target: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
          done
            ? "border-verified/40 bg-verified-soft text-verified"
            : "border-line-strong text-subtle",
        )}
      >
        {done ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-relaxed">
        <span className={done ? "text-muted" : "text-fg"}>{label}</span>
        {done ? null : (
          <button
            type="button"
            onClick={() => focusTarget(target)}
            className="ml-2 cursor-pointer text-sm text-primary-text underline-offset-4 hover:underline"
          >
            Go there
          </button>
        )}
      </span>
    </li>
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
    yearly: useId(),
    description: useId(),
    whatsapp: useId(),
    price: useId(),
    transfer: useId(),
    monetized: useId(),
  };

  const [draft, setDraft] = useState<Draft>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState<"draft" | "review" | null>(null);
  const [failures, setFailures] = useState(0);
  const [pending, startTransition] = useTransition();
  const alertsRef = useRef<HTMLDivElement>(null);

  /**
   * What the last lookup put in the fields.
   *
   * Needed so a second lookup can correct the first. `applyImport` only fills
   * blanks — otherwise a seller who wrote a better title than the channel's
   * own would lose it — but that rule on its own meant pasting the *wrong*
   * link first left the wrong name and handle stuck in the form for ever.
   */
  const lastImport = useRef<ImportedChannel | null>(null);

  /** Any edit makes the "saved" line stale, so it goes. */
  const edit = (fn: (current: Draft) => Draft) => {
    setSaved(false);
    setDraft(fn);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    edit((d) => ({ ...d, [key]: value }));

  const applyImport = (channel: ImportedChannel) => {
    const previous = lastImport.current;
    lastImport.current = channel;

    /**
     * What one field becomes after a lookup.
     *
     * Blanks are filled, and so is anything the *previous* lookup put there —
     * which is what makes pasting the wrong link first recoverable. Anything
     * the seller typed themselves is left exactly as they typed it.
     */
    const take = (current: string, wasImported: string, next: string) =>
      current === "" || current === wasImported ? next : current;

    const subs = (c: ImportedChannel | null) =>
      c && c.subscribers > 0 ? String(c.subscribers) : "";
    const years = (c: ImportedChannel | null) =>
      c && c.ageYears > 0 ? String(c.ageYears) : "";

    edit((current) => ({
      ...current,
      platform: (channel.platform.toLowerCase() ||
        current.platform) as Draft["platform"],
      sourceUrl: channel.canonicalUrl || current.sourceUrl,
      title: take(current.title, previous?.title ?? "", channel.title),
      // The handle, not the display title: "Daily Tech Brief" is not
      // @dailytechbrief, and the slug and the public URL are built from this.
      handle: take(
        current.handle,
        previous?.handle ?? "",
        channel.handle ?? "",
      ),
      description: take(
        current.description,
        previous?.description ?? "",
        channel.description,
      ),
      avatarUrl: current.avatarUrl ?? channel.avatarUrl,
      audience: take(current.audience, subs(previous), subs(channel)),
      ageYears: take(current.ageYears, years(previous), years(channel)),
      country: take(
        current.country,
        previous?.country ?? "",
        channel.country ?? "",
      ),
    }));
  };

  const platform =
    platforms.find((p) => p.id === draft.platform) ?? platforms[0];

  const priceNumber = num(draft.price);
  const showPayout = Number.isFinite(priceNumber) && priceNumber > 0;
  const preview = showPayout ? quote(priceNumber, fees, "FASTEST") : null;
  // The other mode's figure, so a payout number never stands on its own
  // without saying which deal it describes.
  const safest = showPayout ? quote(priceNumber, fees, "SAFEST") : null;

  // ---- progress -------------------------------------------------------
  // "Filled in", not "valid". The server decides what is valid; this only
  // says how much is left to type.
  const filled = (value: string) => value.trim() !== "";
  const captionsDone =
    draft.proofs.length > 0 && draft.proofs.every((p) => filled(p.label));

  const errorKeys = Object.keys(errors).filter((key) => key !== "form");
  const hasErrorIn = (keys: string[], prefix?: string) =>
    errorKeys.some(
      (key) => keys.includes(key) || (prefix ? key.startsWith(prefix) : false),
    );

  const steps = [
    {
      id: STEP.basics,
      label: "The basics",
      icon: TagIcon,
      done: [
        filled(draft.handle),
        filled(draft.title),
        filled(draft.niche),
        filled(draft.country),
      ],
      error: hasErrorIn([
        "platform",
        "handle",
        "title",
        "niche",
        "country",
        "sourceUrl",
      ]),
    },
    {
      id: STEP.numbers,
      label: "The numbers",
      icon: ActivityIcon,
      done: [
        filled(draft.audience),
        filled(draft.engagement),
        filled(draft.ageYears),
      ],
      error: hasErrorIn([
        "audience",
        "engagement",
        "ageYears",
        "monthlyRevenue",
        "yearlyRevenue",
        "monetized",
      ]),
    },
    {
      id: STEP.price,
      label: "Price",
      icon: BanknoteIcon,
      done: [filled(draft.price)],
      error: hasErrorIn(["price"]),
    },
    {
      id: STEP.images,
      label: "Images",
      icon: ImagePlusIcon,
      done: [Boolean(draft.coverUrl), Boolean(draft.avatarUrl)],
      error: hasErrorIn(["coverUrl", "avatarUrl"]),
    },
    {
      id: STEP.proof,
      label: "Proof",
      icon: CameraIcon,
      done: [captionsDone],
      error: hasErrorIn(["proofs"], "proofs."),
    },
    {
      id: STEP.handover,
      label: "Handover",
      icon: ArrowLeftRightIcon,
      done: [] as boolean[],
      error: hasErrorIn(["transferProfile", "description", "whatsapp"]),
    },
  ];

  const stepState = (s: (typeof steps)[number]): StepState => {
    if (s.error) return "error";
    if (s.done.length === 0) return "optional";
    return s.done.every(Boolean) ? "done" : "todo";
  };

  const stepStatus = (s: (typeof steps)[number]) => {
    if (s.error) return "Needs a fix";
    if (s.done.length === 0) return "Optional";
    const left = s.done.filter((d) => !d).length;
    if (left === 0) return "Done";
    return `${left} left`;
  };

  const totalRequired = steps.reduce((n, s) => n + s.done.length, 0);
  const totalDone = steps.reduce(
    (n, s) => n + s.done.filter(Boolean).length,
    0,
  );
  const remaining = totalRequired - totalDone;
  const percent =
    totalRequired === 0 ? 100 : Math.round((totalDone / totalRequired) * 100);

  // ---- error summary --------------------------------------------------
  const targetFor = (key: string) => {
    if (key === "handle") return ids.handle;
    if (key === "title") return ids.title;
    if (key === "niche") return ids.niche;
    if (key === "country") return ids.country;
    if (key === "audience") return ids.audience;
    if (key === "engagement") return ids.engagement;
    if (key === "ageYears") return ids.age;
    if (key === "monthlyRevenue") return ids.revenue;
    if (key === "yearlyRevenue") return ids.yearly;
    if (key === "price") return ids.price;
    if (key === "transferProfile") return ids.transfer;
    if (key === "description") return ids.description;
    if (key === "whatsapp") return ids.whatsapp;
    if (key === "monetized") return ids.monetized;
    if (key === "platform" || key === "sourceUrl") return STEP.basics;
    if (key === "coverUrl" || key === "avatarUrl") return STEP.images;
    const index = proofIndex(key);
    if (index !== null) return `proof-${index}-label`;
    return STEP.proof;
  };

  const summary = errorKeys.map((key) => ({
    key,
    message: errors[key],
    target: targetFor(key),
  }));
  const anyError = summary.length > 0 || Boolean(errors.form);

  /**
   * Send them to what is wrong.
   *
   * In an effect rather than straight after `setErrors`: the save runs inside
   * a transition, so at the point the action returns the messages are not in
   * the DOM yet and looking for them found nothing. Focus moves to the
   * summary, which is also what a screen reader needs.
   */
  useEffect(() => {
    if (failures === 0) return;
    const node = alertsRef.current;
    if (!node) return;
    node.focus();
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [failures]);

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
      yearlyRevenue: num(draft.yearlyRevenue),
      engagement: num(draft.engagement),
      ageYears: num(draft.ageYears),
      price: priceNumber,
      // The uploader hands back a URL or nothing; "" makes zod produce the
      // "Add a cover image" message rather than a type complaint.
      coverUrl: draft.coverUrl ?? "",
      avatarUrl: draft.avatarUrl ?? "",
      transferProfile: draft.transferProfile,
      sourceUrl: draft.sourceUrl,
      description: draft.description,
      whatsapp: draft.whatsapp,
      proofs: draft.proofs,
    };
  }

  function submit(forReview: boolean) {
    setErrors({});
    setSaved(false);
    setSending(forReview ? "review" : "draft");
    startTransition(async () => {
      const result = await saveListing(listingId, toInput(), forReview);
      if (!result.ok) {
        setErrors(result.errors);
        setSending(null);
        setFailures((n) => n + 1);
        return;
      }
      // Editing an existing listing stays on this page, so the only sign the
      // save happened is this line. Without it the button looked broken.
      setSaved(!forReview);
      setSending(null);
      router.push(`/dashboard/listings/${result.id}`);
      router.refresh();
    });
  }

  const busy = pending || sending !== null;

  return (
    <div className="flex flex-col gap-5">
      {/* Outside the form: pasting a link fills the fields in, it does not
          submit anything. */}
      <ChannelImport
        onImported={applyImport}
        currentUrl={draft.sourceUrl || undefined}
      />

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        {/* Progress, pinned under the dashboard header: on a form this long
            the one question people ask is how much is left. */}
        <div className="sticky top-14 z-10 rounded-card border border-line bg-bg/92 px-4 py-3 shadow-soft backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-fg">
              {remaining === 0
                ? "Everything needed is filled in"
                : `${remaining} ${remaining === 1 ? "field" : "fields"} left to fill in`}
            </p>
            <p className="tnum shrink-0 text-xs text-subtle">
              {totalDone}/{totalRequired}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="How much of this listing is filled in"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[var(--ease-out-soft)]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <ul className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto">
            {steps.map((s, i) => {
              const state = stepState(s);
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors",
                      state === "error"
                        ? "border-danger/35 bg-danger-soft text-danger"
                        : state === "done"
                          ? "border-verified/30 bg-verified-soft text-verified"
                          : "border-line bg-surface-2 text-muted hover:text-fg",
                    )}
                  >
                    {state === "done" ? (
                      <CheckIcon aria-hidden="true" className="size-3" />
                    ) : (
                      <span className="tnum font-mono text-[0.625rem]">
                        {i + 1}
                      </span>
                    )}
                    {s.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        {anyError ? (
          /* tabIndex -1: focus is moved here after a failed save, so the
             messages are announced and the seller lands on them instead of
             hunting through a long form. Not reachable by tabbing. */
          <div ref={alertsRef} tabIndex={-1} className="flex flex-col">
            {errors.form ? <FormNotice>{errors.form}</FormNotice> : null}

            {summary.length > 0 ? (
              <div
                role="alert"
                className="rounded-panel border border-danger/30 bg-danger-soft p-4 sm:p-5"
              >
                <p className="flex items-center gap-2 font-display text-base font-bold text-fg">
                  <CircleAlertIcon
                    aria-hidden="true"
                    className="size-[1.15rem] shrink-0 text-danger"
                  />
                  {summary.length === 1
                    ? "One thing to fix"
                    : `${summary.length} things to fix`}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Nothing you typed was lost. Fix these and press the same
                  button again.
                </p>
                {/* Every message, including the ones no field renders — a
                    caption or a channel link failing used to make both
                    buttons do nothing at all, silently. */}
                <ul className="mt-3 flex flex-col gap-1.5">
                  {summary.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => focusTarget(item.target)}
                        className="block min-h-11 cursor-pointer py-2 text-left text-sm leading-relaxed"
                      >
                        <span className="font-medium text-fg underline decoration-danger/40 underline-offset-4">
                          {labelForError(item.key)}
                        </span>
                        <span className="text-muted"> — {item.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <FormSection
          id={STEP.basics}
          step={1}
          of={steps.length}
          icon={TagIcon}
          state={stepState(steps[0])}
          statusLabel={stepStatus(steps[0])}
          title="What are you selling?"
          description="This is what buyers search and filter on, so be specific."
        >
          <fieldset>
            <legend className="text-sm font-medium text-fg">Platform</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set("platform", p.id)}
                  aria-pressed={draft.platform === p.id}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-medium transition-colors sm:justify-start",
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

          {draft.sourceUrl || errors.sourceUrl ? (
            <div>
              <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-3.5">
                <LinkIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-subtle"
                />
                <div className="min-w-0">
                  <p className="text-xs text-subtle">
                    The link this listing points at
                  </p>
                  <p className="mt-0.5 text-sm break-all text-fg">
                    {draft.sourceUrl || "Nothing yet"}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    Set by the box at the top of this page. It is the account
                    your ownership code is read from, so it has to be the one
                    you are selling.
                  </p>
                </div>
              </div>
              {/* The schema can reject this and there is no input for it, so
                  without this line a bad link stops every save with nothing
                  on screen to explain why. */}
              {errors.sourceUrl ? (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {errors.sourceUrl} Paste it again at the top of this page.
                </p>
              ) : null}
            </div>
          ) : null}

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
          <div>
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
            <p className="mt-1.5 text-xs text-subtle">
              {draft.title.trim().length < 10 ? (
                <>
                  At least 10 characters —{" "}
                  <span className="tnum">{draft.title.trim().length}</span> so
                  far.
                </>
              ) : (
                <>
                  <span className="tnum">{draft.title.length}</span> of 120
                  characters.
                </>
              )}
            </p>
          </div>
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
        </FormSection>

        <FormSection
          id={STEP.numbers}
          step={2}
          of={steps.length}
          icon={ActivityIcon}
          state={stepState(steps[1])}
          statusLabel={stepStatus(steps[1])}
          title="The numbers"
          description="Buyers check these against the screenshots you upload below, and so does a moderator. Put down what is actually there — a figure that does not match is the most common reason a listing comes back."
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
            <TextField
              id={ids.yearly}
              name="yearlyRevenue"
              label="Last 12 months (USD)"
              hint="Asked separately because twelve times a good month is a number buyers do not believe."
              inputMode="decimal"
              value={draft.yearlyRevenue}
              onChange={(e) => set("yearlyRevenue", e.target.value)}
              error={errors.yearlyRevenue}
              placeholder="0"
            />
          </div>

          <label
            htmlFor={ids.monetized}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 text-sm text-muted"
          >
            <input
              id={ids.monetized}
              type="checkbox"
              checked={draft.monetized}
              onChange={(e) => set("monetized", e.target.checked)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
            />
            <span>
              <span className="font-medium text-fg">
                This account is monetized.
              </span>
              <span className="mt-0.5 block text-xs text-subtle">
                Claiming this when it is not is the fastest way to have a
                listing rejected.
              </span>
            </span>
          </label>
          {errors.monetized ? (
            <p role="alert" className="text-sm text-danger">
              {errors.monetized}
            </p>
          ) : null}
        </FormSection>

        <FormSection
          id={STEP.price}
          step={3}
          of={steps.length}
          icon={BanknoteIcon}
          state={stepState(steps[2])}
          statusLabel={stepStatus(steps[2])}
          title="Your price"
          description="You set it, and buyers can still make an offer. You never have to accept one."
        >
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
          {preview && safest ? (
            <div className="rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
              <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                On a Fastest deal
              </p>
              <dl className="mt-3 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
                <div className="bg-surface p-4">
                  <dt className="text-xs text-subtle">Buyer pays</dt>
                  <dd className="tnum mt-1 font-display text-lg font-bold text-fg">
                    {money(preview.total)}
                  </dd>
                </div>
                <div className="bg-surface p-4">
                  <dt className="text-xs text-subtle">
                    Channel Adda fee ({formatRate(fees.sellerFeeBp)}%)
                  </dt>
                  <dd className="tnum mt-1 font-display text-lg font-bold text-muted">
                    −{money(preview.sellerFee)}
                  </dd>
                </div>
                <div className="bg-surface p-4">
                  <dt className="text-xs text-subtle">
                    Into your Channel Adda balance
                  </dt>
                  <dd className="tnum mt-1 font-display text-lg font-bold text-verified">
                    {money(preview.payout)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-subtle">
                Fastest: the buyer pays Channel Adda up front, you hand the
                account over with an agent watching, and your balance is
                credited once the buyer confirms.
              </p>
              <p className="mt-2 border-t border-line pt-3 text-xs leading-relaxed text-subtle">
                On a <span className="font-medium text-muted">Safest</span> deal
                the figures are different: the buyer pays Channel Adda only the{" "}
                {money(safest.total)} admin fee, our agent takes the account
                from you, and the buyer pays you the {money(priceNumber)}{" "}
                directly — nothing passes through the platform, so nothing is
                deducted here.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Enter a price and we will show you exactly what reaches you on
              each kind of deal.
            </p>
          )}
        </FormSection>

        <FormSection
          id={STEP.images}
          step={4}
          of={steps.length}
          icon={ImagePlusIcon}
          state={stepState(steps[3])}
          statusLabel={stepStatus(steps[3])}
          title="Images"
          description="A cover for the listing card and a profile picture for the account itself. Both are needed before this can go in front of buyers — a draft saves fine without them."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {/* The chip sits on the uploader's own label line, so whether a
                picture is still needed is answered without scrolling to the
                checklist at the bottom. */}
            <div className="relative">
              <Badge
                className="absolute top-0 right-0"
                variant={draft.coverUrl ? "verified" : "primary"}
              >
                {draft.coverUrl ? (
                  <>
                    <CheckIcon aria-hidden="true" />
                    Added
                  </>
                ) : (
                  "Needed to publish"
                )}
              </Badge>
              <ImageUpload
                kind="cover"
                label="Cover image"
                hint="Wide. A channel banner or a screenshot of the feed works well."
                value={draft.coverUrl}
                onChange={(url) => set("coverUrl", url)}
              />
            </div>
            <div className="relative">
              <Badge
                className="absolute top-0 right-0"
                variant={draft.avatarUrl ? "verified" : "primary"}
              >
                {draft.avatarUrl ? (
                  <>
                    <CheckIcon aria-hidden="true" />
                    Added
                  </>
                ) : (
                  "Needed to publish"
                )}
              </Badge>
              <ImageUpload
                kind="avatar"
                aspect="square"
                label="Profile picture"
                hint="Square. The account's own avatar."
                value={draft.avatarUrl}
                onChange={(url) => set("avatarUrl", url)}
              />
            </div>
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
        </FormSection>

        <FormSection
          id={STEP.proof}
          step={5}
          of={steps.length}
          icon={CameraIcon}
          state={stepState(steps[4])}
          statusLabel={stepStatus(steps[4])}
          title="Proof the account is yours"
          description="Screenshots from inside the account — analytics, revenue, the account settings page. This is what a moderator checks your numbers against, and it is never shown to buyers in full. At least one is needed, up to eight."
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-fg">
              Screenshots added:{" "}
              <span className="tnum">{draft.proofs.length}</span> of 8
            </p>
            {draft.proofs.length > 0 && !captionsDone ? (
              <Badge variant="primary" size="md">
                Each one needs a caption
              </Badge>
            ) : null}
          </div>

          {draft.proofs.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {draft.proofs.map((proof, i) => {
                const captionId = `proof-${i}-label`;
                const captionError = errors[`proofs.${i}.label`];
                const fileError =
                  errors[`proofs.${i}.url`] ?? errors[`proofs.${i}.sha256`];
                return (
                  <li
                    key={proof.url}
                    className={cn(
                      "rounded-card border bg-surface-2 p-3",
                      captionError || fileError
                        ? "border-danger/40"
                        : "border-line",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* biome-ignore lint/performance/noImgElement: a thumbnail
                        of the seller's own upload. next/image would send their
                        file back through the optimiser to draw it at 64px. */}
                      <img
                        src={proof.url}
                        alt=""
                        width={64}
                        height={64}
                        className="size-16 shrink-0 rounded-lg border border-line object-cover"
                      />
                      <p className="min-w-0 flex-1 font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                        Screenshot <span className="tnum">{i + 1}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          edit((d) => ({
                            ...d,
                            proofs: d.proofs.filter((_, j) => j !== i),
                          }))
                        }
                        aria-label={`Remove screenshot ${i + 1}`}
                        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line text-muted transition-colors hover:border-danger/50 hover:text-danger"
                      >
                        <TrashIcon aria-hidden="true" className="size-4" />
                      </button>
                    </div>

                    <label
                      htmlFor={captionId}
                      className="mt-3 block text-sm font-medium text-fg"
                    >
                      What this shows
                      <span aria-hidden="true" className="ml-0.5 text-danger">
                        *
                      </span>
                    </label>
                    <input
                      id={captionId}
                      required
                      aria-invalid={captionError ? true : undefined}
                      aria-describedby={
                        captionError ? `${captionId}-error` : undefined
                      }
                      value={proof.label}
                      onChange={(e) =>
                        edit((d) => ({
                          ...d,
                          proofs: d.proofs.map((p, j) =>
                            j === i ? { ...p, label: e.target.value } : p,
                          ),
                        }))
                      }
                      placeholder="e.g. Last 28 days of revenue"
                      className={cn(
                        "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3.5 text-base text-fg placeholder:text-subtle focus:outline-none sm:text-[0.9375rem]",
                        captionError
                          ? "border-danger focus:border-danger"
                          : "border-line focus:border-primary/60",
                      )}
                    />
                    {/* Without this the whole form died silently: the schema
                        requires a caption, a screenshot arrives with an empty
                        one, and the failure is keyed `proofs.0.label` — which
                        nothing rendered and the scroll-to-first-error could not
                        find either. Both buttons flickered and did nothing. */}
                    {captionError ? (
                      <p
                        id={`${captionId}-error`}
                        role="alert"
                        className="mt-1.5 text-sm text-danger"
                      >
                        {captionError}
                      </p>
                    ) : null}
                    {fileError ? (
                      <p role="alert" className="mt-1.5 text-sm text-danger">
                        {fileError} Remove this one and upload it again.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-card border border-dashed border-line-strong bg-surface-2 px-4 py-5 text-center text-sm leading-relaxed text-muted">
              Nothing uploaded yet. One screenshot of your analytics is enough
              to start.
            </p>
          )}

          {draft.proofs.length < 8 ? (
            <ImageUpload
              kind="proof"
              label={
                draft.proofs.length === 0
                  ? "Add a screenshot"
                  : "Add another screenshot"
              }
              hint={`Up to eight. ${8 - draft.proofs.length} slot${
                8 - draft.proofs.length === 1 ? "" : "s"
              } left.`}
              value={null}
              onChange={(_url, file) => {
                if (!file) return;
                edit((d) => ({
                  ...d,
                  proofs: [
                    ...d.proofs,
                    { url: file.url, label: "", sha256: file.sha256 },
                  ],
                }));
              }}
            />
          ) : (
            <p className="flex items-center gap-2 text-sm text-subtle">
              <CheckIcon aria-hidden="true" className="size-4 text-verified" />
              That is the maximum of eight.
            </p>
          )}

          {errors.proofs ? (
            <p role="alert" className="text-sm text-danger">
              {errors.proofs}
            </p>
          ) : null}
        </FormSection>

        <FormSection
          id={STEP.handover}
          step={6}
          of={steps.length}
          icon={ArrowLeftRightIcon}
          state={stepState(steps[5])}
          statusLabel={stepStatus(steps[5])}
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

          <div>
            <TextArea
              id={ids.description}
              name="description"
              label="About this account (optional)"
              hint="What it is, who watches it, how it earns, and anything a buyer would be annoyed to find out later. The fields above cannot carry 'the audience moved from shorts to long-form in March'."
              rows={6}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              error={errors.description}
            />
            <p className="mt-1.5 text-xs text-subtle">
              <span className="tnum">{draft.description.length}</span> of 4,000
              characters.
            </p>
          </div>

          <TextField
            id={ids.whatsapp}
            name="whatsapp"
            label="WhatsApp number (Channel Adda only)"
            hint="Never shown to buyers. We use it to reach you if a transfer stalls, which is the one moment email is too slow."
            inputMode="tel"
            value={draft.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
            error={errors.whatsapp}
            placeholder="+8801712345678"
          />
        </FormSection>

        <div className="rounded-panel border border-line bg-surface p-4 sm:p-6">
          <h2 className="font-display text-base font-bold text-fg sm:text-lg">
            Before buyers can see it
          </h2>
          <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-muted">
            A draft saves without any of this. These three are what the next
            button needs.
          </p>
          <ul className="mt-4 flex flex-col gap-2.5">
            <Requirement
              done={Boolean(draft.coverUrl)}
              label="A cover image"
              target={STEP.images}
            />
            <Requirement
              done={Boolean(draft.avatarUrl)}
              label="A profile picture"
              target={STEP.images}
            />
            <Requirement
              done={captionsDone}
              label="At least one screenshot from inside the account, each with a caption"
              target={STEP.proof}
            />
          </ul>
          <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-subtle">
            After that you get a one-time code to put in your{" "}
            {platform?.name ?? "account"} description. We read it back to prove
            the account is yours, then a moderator checks the listing — usually
            within a few hours.
          </p>
        </div>

        {/* The save buttons follow the page down. A draft being safe is the
            thing sellers most need to believe on a form this long, and it
            cannot be believable if the button is only at the bottom. */}
        <div className="sticky bottom-0 z-10 rounded-card border border-line bg-bg/92 p-3 shadow-lift backdrop-blur-xl sm:px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p
              aria-live="polite"
              className="flex items-start gap-2 text-xs leading-relaxed text-muted sm:text-sm"
            >
              {saved ? (
                <>
                  <CheckIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-verified"
                  />
                  <span>
                    Draft saved. Still private — nothing is shown to buyers yet.
                  </span>
                </>
              ) : (
                <>
                  <LockIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-subtle"
                  />
                  <span>
                    Private to you. Save a draft at any point and come back —
                    half-finished is fine.
                  </span>
                </>
              )}
            </p>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button
                type="submit"
                variant="secondary"
                size="md"
                className="w-full sm:w-auto"
                disabled={busy}
              >
                {sending === "draft" ? (
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                    Saving…
                  </>
                ) : (
                  "Save draft"
                )}
              </Button>
              <Button
                type="button"
                size="md"
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={() => submit(true)}
              >
                {sending === "review" ? (
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                    Saving…
                  </>
                ) : (
                  "Save and verify ownership"
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
