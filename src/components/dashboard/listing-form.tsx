"use client";

import {
  ActivityIcon,
  ArrowLeftRightIcon,
  BanknoteIcon,
  CameraIcon,
  CheckIcon,
  CircleAlertIcon,
  ImagePlusIcon,
  Loader2Icon,
  LockIcon,
  PencilIcon,
  TagIcon,
  TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { InfoTip } from "@/components/app/info-tip";
import { IconTile, inputClass, labelClass, Meter } from "@/components/app/kit";
import { FormNotice, TextArea, TextField } from "@/components/auth/fields";
import {
  ChannelLinkField,
  type ImportedChannel,
  linkLabel,
  PLATFORM_MARK,
  type PlatformId,
  tintStyle,
} from "@/components/dashboard/channel-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
import { ImageUpload } from "@/components/upload/image-upload";
import { type FeeSettings, formatRate, quote } from "@/lib/fees";
import type { ListingDraftInput, PLATFORM_IDS } from "@/lib/listing-form";
import {
  handleForLink as handleFor,
  type ImportKey,
  mergeImport,
  undoImport,
} from "@/lib/listing-import";
import { cn } from "@/lib/utils";
import { saveListing } from "@/server/actions/listings";

type Proof = { url: string; label: string; sha256: string };

export type PlatformChoice = {
  id: (typeof PLATFORM_IDS)[number];
  name: string;
  metricLabel: string;
  transferNote: string;
  /** The platform's brand colour token, e.g. `var(--brand-youtube)`. */
  tint: string;
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** The schema's own `.max(8)` on proofs, which is the limit that counts. */
const MAX_PROOFS = 8;

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
  sourceUrl: "Account link",
};

function proofIndex(key: string): number | null {
  const match = key.match(/^proofs\.(\d+)\./);
  return match ? Number(match[1]) : null;
}

function labelForError(key: string, platform: PlatformId) {
  // The link is called what the platform calls it — "Channel URL" on
  // YouTube, "Profile URL" on Instagram — so the summary matches the field.
  if (key === "sourceUrl") return linkLabel(platform);
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

/**
 * Clears the dashboard header and the pinned progress bar, so a section
 * reached from the bar's links lands with its title in view rather than
 * tucked underneath it.
 */
const SECTION_SCROLL = "scroll-mt-52 sm:scroll-mt-40";

/** One numbered block of the form. */
function FormSection({
  id,
  step,
  of,
  title,
  description,
  info,
  icon: Icon,
  state,
  statusLabel,
  children,
}: {
  id: string;
  step: number;
  of: number;
  title: string;
  /** One short line, or nothing. Anything longer belongs in `info`. */
  description?: ReactNode;
  /** The longer explanation, behind an (i) beside the title. */
  info?: ReactNode;
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
        SECTION_SCROLL,
        "rounded-card border bg-surface shadow-xs transition-colors duration-150",
        state === "error" ? "border-danger/40" : "border-line",
      )}
    >
      <div className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <IconTile
          icon={Icon}
          size="sm"
          tone={
            state === "done"
              ? "verified"
              : state === "error"
                ? "danger"
                : "neutral"
          }
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-5 text-subtle">
            Step <span className="tabular-nums">{step}</span> of{" "}
            <span className="tabular-nums">{of}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <h2
              id={`${id}-title`}
              className="text-sm leading-5 font-semibold text-fg"
            >
              {title}
            </h2>
            {info ? <InfoTip label={`About ${title}`}>{info}</InfoTip> : null}
          </div>
          {description ? (
            <p className="mt-1 max-w-[72ch] text-[0.8125rem] leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <Badge
          variant={
            state === "done"
              ? "verified"
              : state === "error"
                ? "danger"
                : "neutral"
          }
          size="sm"
          className="mt-0.5"
        >
          {state === "done" ? (
            <CheckIcon aria-hidden="true" />
          ) : state === "error" ? (
            <CircleAlertIcon aria-hidden="true" />
          ) : null}
          {statusLabel}
        </Badge>
      </div>

      <div className="flex flex-col gap-5 p-4 sm:p-5">{children}</div>
    </section>
  );
}

/**
 * The reason behind a field, as an (i) on its label line instead of a second
 * sentence under it. What prevents a mistake — a format, a limit, who sees
 * it — stays in the field's own hint.
 *
 * `TextField` takes its label as a string, so the tip sits at the right end
 * of the label row (where `PasswordField` puts its aside) rather than inside
 * the `<label>`, where every click on the label would also press it.
 */
function FieldInfo({
  label,
  info,
  className,
  children,
}: {
  /** The field's label, for the button's name. */
  label: string;
  info: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      <InfoTip label={`About ${label}`} className="absolute -top-px right-0">
        {info}
      </InfoTip>
      {children}
    </div>
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
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
          done
            ? "border-verified/30 bg-verified-soft text-verified"
            : "border-line-strong bg-surface text-subtle",
        )}
      >
        {done ? (
          <CheckIcon aria-hidden="true" className="size-3" strokeWidth={3} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-relaxed">
        <span className={done ? "text-muted" : "text-fg"}>{label}</span>
        {done ? null : (
          <button
            type="button"
            onClick={() => focusTarget(target)}
            className="ml-2 cursor-pointer rounded-sm text-[0.8125rem] font-medium text-muted underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg"
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
    link: useId(),
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
  // State, not a ref: the render reads it to decide whether the handle is
  // still the channel's, and a ref read during render stops the React
  // Compiler optimising this whole form.
  const [lastImport, setLastImport] = useState<ImportedChannel | null>(null);

  /** Any edit makes the "saved" line stale, so it goes. */
  const edit = (fn: (current: Draft) => Draft) => {
    setSaved(false);
    setDraft(fn);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    edit((d) => ({ ...d, [key]: value }));

  /** Opens the handle for typing, instead of following the link. */
  const [editingHandle, setEditingHandle] = useState(false);

  /**
   * The link, with the handle following it.
   *
   * The handle is what the slug and the public page are built from, and the
   * link already carries it, so typing both was asking for the same thing
   * twice. It follows only while it is still the one the link gave — a handle
   * the seller typed themselves is never overwritten.
   */
  const setLink = (link: string) =>
    edit((d) => {
      const before = handleFor(d.sourceUrl, d.platform);
      const follows = d.handle === "" || d.handle === before;
      return {
        ...d,
        sourceUrl: link,
        handle: follows ? handleFor(link, d.platform) : d.handle,
      };
    });

  /**
   * The form as it last rendered, for code that runs after an await.
   *
   * A lookup takes a few seconds, and the seller may type in the meantime;
   * filling from the draft as it was when the fetch began would throw those
   * keystrokes away.
   */
  const latest = useRef({ draft, lastImport });
  useEffect(() => {
    latest.current = { draft, lastImport };
  });

  /** What the last fill changed, so "Not my channel" can take it back out. */
  const [lastFill, setLastFill] = useState<{
    before: Draft;
    after: Draft;
    previous: ImportedChannel | null;
  } | null>(null);

  /** Fills the form from a fetched channel; returns the fields it changed. */
  const applyImport = (channel: ImportedChannel): ImportKey[] => {
    const { draft: current, lastImport: previous } = latest.current;
    const platformName =
      platforms.find((p) => p.id === channel.platform.toLowerCase())?.name ??
      "the";
    const { next, filled } = mergeImport(
      current,
      channel,
      previous,
      platformName,
    );
    setLastImport(channel);
    setEditingHandle(false);
    setLastFill({ before: current, after: next, previous });
    edit(() => next);
    return filled;
  };

  const undoLastFill = () => {
    if (!lastFill) return;
    edit((current) => undoImport(current, lastFill.before, lastFill.after));
    setLastImport(lastFill.previous);
    setLastFill(null);
  };

  const platform =
    platforms.find((p) => p.id === draft.platform) ?? platforms[0];

  // Shown as a quiet line rather than a field while it is simply what the
  // link says; a field again the moment there is something to decide.
  const suggestedHandle = handleFor(draft.sourceUrl, draft.platform);
  const handleFollowsLink =
    draft.handle !== "" &&
    !editingHandle &&
    !errors.handle &&
    (draft.handle === suggestedHandle || draft.handle === lastImport?.handle);
  const showHandleField =
    !handleFollowsLink &&
    (editingHandle ||
      Boolean(errors.handle) ||
      draft.handle !== "" ||
      draft.sourceUrl.trim() !== "");

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
        // The link and the handle it gives are one thing to the seller.
        filled(draft.sourceUrl) && filled(draft.handle),
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
    if (key === "sourceUrl") return ids.link;
    if (key === "platform") return STEP.basics;
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
      // Hidden unless monetized, so never sent from a field nobody can see:
      // a figure typed before unticking would otherwise ride along.
      monthlyRevenue: draft.monetized ? num(draft.monthlyRevenue) : 0,
      yearlyRevenue: draft.monetized ? num(draft.yearlyRevenue) : 0,
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
      let result: Awaited<ReturnType<typeof saveListing>>;
      try {
        result = await saveListing(listingId, toInput(), forReview);
      } catch {
        // A dropped connection or a deploy mid-save. Thrown out of the
        // transition it would reach the error boundary and take every field
        // with it; here it is one line above a form that is still full.
        result = {
          ok: false,
          errors: {
            form: "We could not reach Channel Adda, so nothing was saved. Check your connection and press the same button again — everything you typed is still here.",
          },
        };
      }
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
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* noValidate: the browser's own "Please fill out this field" ran
          before the save and blocked every half-finished draft, though the
          server's draft rules allow one. The server decides what is valid. */}
      <form
        noValidate
        className="flex flex-col gap-4 sm:gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        {/* Progress, pinned under the dashboard header: on a form this long
            the one question people ask is how much is left. */}
        <div className="sticky top-14 z-10 rounded-card border border-line bg-bg/85 px-3 py-2.5 backdrop-blur-xl sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.8125rem] leading-5 font-medium text-fg">
              {remaining === 0
                ? "Everything needed is filled in"
                : `${remaining} ${remaining === 1 ? "field" : "fields"} left to fill in`}
            </p>
            <p className="shrink-0 text-xs text-subtle tabular-nums">
              {totalDone}/{totalRequired}
            </p>
          </div>
          <Meter
            className="mt-2"
            value={percent}
            max={100}
            label="How much of this listing is filled in"
            tone={percent === 100 ? "verified" : "primary"}
          />
          {/* The step links stay off a phone's pinned card until one has a
              problem to jump to: with them it took a quarter of the screen. */}
          <ul
            className={cn(
              "no-scrollbar -mx-1 mt-1.5 flex gap-0.5 overflow-x-auto px-1",
              !steps.some((s) => stepState(s) === "error") && "max-sm:hidden",
            )}
          >
            {steps.map((s, i) => {
              const state = stepState(s);
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={cn(
                      "inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors duration-150 pointer-fine:h-7",
                      state === "error"
                        ? "bg-danger-soft text-danger hover:bg-danger-soft/70"
                        : "text-muted hover:bg-surface-2 hover:text-fg",
                    )}
                  >
                    {state === "done" ? (
                      <span className="inline-flex size-4 items-center justify-center rounded-full bg-verified-soft text-verified">
                        <CheckIcon
                          aria-hidden="true"
                          className="size-2.5"
                          strokeWidth={3}
                        />
                      </span>
                    ) : state === "error" ? (
                      <CircleAlertIcon
                        aria-hidden="true"
                        className="size-3.5"
                      />
                    ) : (
                      <span className="inline-flex size-4 items-center justify-center rounded-full border border-line-strong text-[0.625rem] leading-none text-subtle tabular-nums">
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
          <div
            ref={alertsRef}
            tabIndex={-1}
            className="flex flex-col rounded-card"
          >
            {errors.form ? <FormNotice>{errors.form}</FormNotice> : null}

            {summary.length > 0 ? (
              <div
                role="alert"
                className="rounded-card border border-danger/25 bg-danger-soft/60 px-4 py-3.5 sm:px-5"
              >
                <p className="flex items-center gap-2 text-sm leading-5 font-semibold text-fg">
                  <CircleAlertIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-danger"
                  />
                  {summary.length === 1
                    ? "One thing to fix"
                    : `${summary.length} things to fix`}
                </p>
                <p className="mt-0.5 pl-6 text-[0.8125rem] leading-relaxed text-muted">
                  Nothing you typed was lost. Fix these and press the same
                  button again.
                </p>
                {/* Every message, including the ones no field renders — a
                    caption or a channel link failing used to make both
                    buttons do nothing at all, silently. */}
                <ul className="mt-2 flex flex-col pl-6">
                  {summary.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => focusTarget(item.target)}
                        className="group block min-h-11 cursor-pointer py-2 text-left text-[0.8125rem] leading-relaxed pointer-fine:min-h-0 pointer-fine:py-1"
                      >
                        <span className="font-medium text-fg underline decoration-danger/40 underline-offset-4 transition-colors duration-150 group-hover:decoration-danger">
                          {labelForError(item.key, platform.id)}
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
            <legend className={labelClass}>Platform</legend>
            {/* Each in its own colour, quietly: the mark in a tinted tile,
                and the chosen one edged and washed in it. Enough to find
                YouTube at a glance without five brands shouting at once. */}
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {platforms.map((p) => {
                const chosen = draft.platform === p.id;
                const Mark = PLATFORM_MARK[p.id];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set("platform", p.id)}
                    aria-pressed={chosen}
                    // The mark and the tick are hidden, and the name is a
                    // truncated span: said outright so the button is named.
                    aria-label={p.name}
                    style={tintStyle(p.tint)}
                    className={cn(
                      "group/platform relative inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-lg border pr-3 pl-2 text-sm font-medium shadow-xs transition-[border-color,background-color,color,box-shadow] duration-200 pointer-fine:h-11",
                      chosen
                        ? "border-[color-mix(in_oklab,var(--tint)_55%,transparent)] bg-[color-mix(in_oklab,var(--tint)_6%,var(--color-surface))] text-fg ring-1 ring-[color-mix(in_oklab,var(--tint)_30%,transparent)] dark:bg-[color-mix(in_oklab,var(--tint)_10%,var(--color-surface-2))]"
                        : errors.platform
                          ? "border-danger bg-surface text-muted hover:text-fg dark:bg-surface-2"
                          : "border-line bg-surface text-muted hover:border-[color-mix(in_oklab,var(--tint)_35%,var(--color-line))] hover:text-fg dark:bg-surface-2",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--tint)] transition-[background-color,transform] duration-200 group-hover/platform:scale-[1.04] pointer-fine:size-7",
                        chosen
                          ? "bg-[color-mix(in_oklab,var(--tint)_14%,transparent)]"
                          : "bg-[color-mix(in_oklab,var(--tint)_9%,transparent)]",
                      )}
                    >
                      <Mark className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">
                      {p.name}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-white transition-[background-color,opacity,scale] duration-200",
                        chosen
                          ? "scale-100 bg-[var(--tint)] opacity-100"
                          : "scale-75 opacity-0",
                      )}
                    >
                      <CheckIcon className="size-2.5" strokeWidth={3.5} />
                    </span>
                  </button>
                );
              })}
            </div>
            {errors.platform ? (
              <p role="alert" className="mt-1.5 text-[0.8125rem] text-danger">
                {errors.platform}
              </p>
            ) : null}
          </fieldset>

          <ChannelLinkField
            id={ids.link}
            platform={platform}
            names={
              Object.fromEntries(
                platforms.map((p) => [p.id, p.name]),
              ) as Record<PlatformId, string>
            }
            value={draft.sourceUrl}
            onChange={setLink}
            onPlatform={(id) => set("platform", id)}
            onFill={applyImport}
            onUndo={undoLastFill}
            error={errors.sourceUrl}
            savedUrl={initial?.sourceUrl || undefined}
          />

          {handleFollowsLink ? (
            <p className="-mt-2 flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-muted">
              <span className="shrink-0">Listed as</span>
              <span className="truncate font-medium text-fg">
                {draft.platform === "website" ? "" : "@"}
                {draft.handle.replace(/^@/, "")}
              </span>
              <InfoTip label="About the handle">
                Taken from the link. Your listing's address is built from it,
                and once ownership is verified it becomes the channel's own.
              </InfoTip>
              <button
                type="button"
                aria-label="Edit handle"
                onClick={() => {
                  setEditingHandle(true);
                  // This button goes as the field arrives; without moving
                  // focus into the field, a keyboard user lands on <body>.
                  requestAnimationFrame(() =>
                    document.getElementById(ids.handle)?.focus(),
                  );
                }}
                className="ml-1 inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[0.8125rem] font-medium text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg pointer-fine:h-7"
              >
                <PencilIcon aria-hidden="true" className="size-3" />
                Edit
              </button>
            </p>
          ) : null}

          {showHandleField ? (
            <TextField
              id={ids.handle}
              name="handle"
              label="Handle"
              hint="The account's name as buyers would search for it, for example @dailytechbrief."
              value={draft.handle}
              onChange={(e) => set("handle", e.target.value)}
              error={errors.handle}
              placeholder="@dailytechbrief"
              required
            />
          ) : null}
          <FieldInfo
            label="Listing title"
            info="What a buyer sees first. Say what it is and why it is worth having."
          >
            <TextField
              id={ids.title}
              name="title"
              label="Listing title"
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
                  <span className="tabular-nums">
                    {draft.title.trim().length}
                  </span>{" "}
                  so far.
                </>
              ) : (
                <>
                  <span className="tabular-nums">{draft.title.length}</span> of
                  120 characters.
                </>
              )}
            </p>
          </FieldInfo>
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
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
          description="Put down what is actually there."
          info="Buyers check these against the screenshots you upload below, and so does a moderator. Put down what is actually there — a figure that does not match is the most common reason a listing comes back."
        >
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
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
          </div>

          {/* Revenue belongs to the monetized answer, so it opens inside it.
              Asking a channel that earns nothing what it earns a month was a
              question with only one answer; unticked, both are saved as 0. */}
          <div>
            <div
              className={cn(
                "overflow-hidden rounded-lg border bg-surface shadow-xs transition-[border-color,box-shadow] duration-200 dark:bg-surface-2",
                errors.monetized
                  ? "border-danger"
                  : draft.monetized
                    ? "border-fg ring-1 ring-fg"
                    : "border-line hover:border-line-strong",
              )}
            >
              <label
                htmlFor={ids.monetized}
                className={cn(
                  "flex cursor-pointer items-start gap-3 px-3.5 py-3 text-sm text-muted transition-colors duration-150",
                  !draft.monetized && "hover:bg-surface-2/60",
                )}
              >
                <input
                  id={ids.monetized}
                  type="checkbox"
                  checked={draft.monetized}
                  onChange={(e) => {
                    const monetized = e.target.checked;
                    // The fields open on the examples, not on a "0" that
                    // reads as an answer already given.
                    const blankIfZero = (value: string) =>
                      monetized && value.trim() === "0" ? "" : value;
                    edit((d) => ({
                      ...d,
                      monetized,
                      monthlyRevenue: blankIfZero(d.monthlyRevenue),
                      yearlyRevenue: blankIfZero(d.yearlyRevenue),
                    }));
                  }}
                  aria-controls={`${ids.monetized}-revenue`}
                  className="mt-0.5 size-4 shrink-0 cursor-pointer accent-fg"
                />
                <span>
                  <span className="font-medium text-fg">
                    This account is monetized.
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-subtle">
                    Claiming this when it is not is the fastest way to have a
                    listing rejected.
                  </span>
                </span>
              </label>

              {/* Height eased open with the grid-rows trick; inert while shut,
                  so a keyboard never lands in a field nobody can see. */}
              <div
                id={`${ids.monetized}-revenue`}
                inert={!draft.monetized}
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
                  draft.monetized
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="grid gap-x-4 gap-y-5 border-t border-line px-3.5 pt-3.5 pb-4 sm:grid-cols-2">
                    <TextField
                      id={ids.revenue}
                      name="monthlyRevenue"
                      label="Monthly revenue (USD)"
                      hint="An average recent month."
                      inputMode="decimal"
                      value={draft.monthlyRevenue}
                      onChange={(e) => set("monthlyRevenue", e.target.value)}
                      error={errors.monthlyRevenue}
                      placeholder="850"
                    />
                    <FieldInfo
                      label="Last 12 months (USD)"
                      info="Asked separately because twelve times a good month is a number buyers do not believe."
                    >
                      <TextField
                        id={ids.yearly}
                        name="yearlyRevenue"
                        label="Last 12 months (USD)"
                        hint="The actual total, not twelve months."
                        inputMode="decimal"
                        value={draft.yearlyRevenue}
                        onChange={(e) => set("yearlyRevenue", e.target.value)}
                        error={errors.yearlyRevenue}
                        placeholder="9600"
                      />
                    </FieldInfo>
                  </div>
                </div>
              </div>
            </div>
            {errors.monetized ? (
              <p role="alert" className="mt-1.5 text-[0.8125rem] text-danger">
                {errors.monetized}
              </p>
            ) : null}
          </div>
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
            className="sm:max-w-xs"
            inputMode="decimal"
            value={draft.price}
            onChange={(e) => set("price", e.target.value)}
            error={errors.price}
            placeholder="4500"
            required
          />
          {preview && safest ? (
            <div>
              <p className="text-xs font-medium text-muted">
                On a Fastest deal
              </p>
              <dl
                className={cn(
                  "mt-2 grid gap-px overflow-hidden rounded-lg border border-line bg-line",
                  fees.sellerFeeBp > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2",
                )}
              >
                <div className="bg-surface px-3.5 py-3 dark:bg-surface-2">
                  <dt className="text-xs text-subtle">Buyer pays</dt>
                  <dd className="mt-1 text-lg leading-6 font-semibold tracking-[-0.01em] text-fg tabular-nums">
                    {money(preview.total)}
                  </dd>
                </div>
                {/* No fee, no cell: "fee (0%) −$0" read as a charge. */}
                {fees.sellerFeeBp > 0 ? (
                  <div className="bg-surface px-3.5 py-3 dark:bg-surface-2">
                    <dt className="text-xs text-subtle">
                      Channel Adda fee ({formatRate(fees.sellerFeeBp)}%)
                    </dt>
                    <dd className="mt-1 text-lg leading-6 font-semibold tracking-[-0.01em] text-muted tabular-nums">
                      −{money(preview.sellerFee)}
                    </dd>
                  </div>
                ) : null}
                <div className="bg-surface px-3.5 py-3 dark:bg-surface-2">
                  <dt className="text-xs text-subtle">
                    Into your Channel Adda balance
                  </dt>
                  <dd className="mt-1 text-lg leading-6 font-semibold tracking-[-0.01em] text-verified tabular-nums">
                    {money(preview.payout)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2.5 text-xs leading-relaxed text-subtle">
                Fastest: the buyer pays Channel Adda up front, you invite our
                agent as owner, and your balance is credited as soon as our
                agent is primary owner.
              </p>
              <p className="mt-2.5 border-t border-line pt-2.5 text-xs leading-relaxed text-subtle">
                On a <span className="font-medium text-muted">Safest</span> deal
                the buyer pays Channel Adda only the {money(safest.total)} admin
                fee. Our agent takes the account from you and verifies it, the
                buyer pays you the {money(priceNumber)} directly, and once you
                confirm it arrived our agent transfers the account to them.
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface-2/40 px-3.5 py-3 text-[0.8125rem] text-muted">
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
          // The "Needed to publish" chips on each uploader say the second
          // half at a glance; the whole sentence is behind the (i).
          info="A cover for the listing card and a profile picture for the account itself. Both are needed before this can go in front of buyers — a draft saves fine without them."
        >
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
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
              {/* The error renders inside the uploader, beside the control it
                  is about and wired to it with aria-describedby — the same
                  home it had a few lines below, moved, not dropped. */}
              <ImageUpload
                kind="cover"
                label="Cover image"
                hint="Wide. A channel banner or a screenshot of the feed works well."
                value={draft.coverUrl}
                onChange={(url) => set("coverUrl", url)}
                error={errors.coverUrl}
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
                error={errors.avatarUrl}
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          id={STEP.proof}
          step={5}
          of={steps.length}
          icon={CameraIcon}
          state={stepState(steps[4])}
          statusLabel={stepStatus(steps[4])}
          title="Proof the account is yours"
          description="Screenshots from inside the account — analytics, revenue, the account settings page. Never shown to buyers in full."
          info="Screenshots from inside the account — analytics, revenue, the account settings page. This is what a moderator checks your numbers against, and it is never shown to buyers in full. At least one is needed, up to eight."
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-[0.8125rem] font-medium text-fg">
              Screenshots added:{" "}
              <span className="tabular-nums">{draft.proofs.length}</span> of{" "}
              <span className="tabular-nums">{MAX_PROOFS}</span>
            </p>
            {draft.proofs.length > 0 && !captionsDone ? (
              <Badge variant="primary" size="sm">
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
                      "rounded-lg border bg-surface p-3 transition-colors duration-150 dark:bg-surface-2",
                      captionError || fileError
                        ? "border-danger"
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
                        className="size-14 shrink-0 rounded-md border border-line bg-surface-2 object-cover"
                      />
                      <p className="min-w-0 flex-1 pt-0.5 text-xs font-medium text-muted">
                        Screenshot <span className="tabular-nums">{i + 1}</span>
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
                        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors duration-150 hover:bg-danger-soft hover:text-danger pointer-fine:size-8"
                      >
                        <TrashIcon aria-hidden="true" className="size-4" />
                      </button>
                    </div>

                    <label
                      htmlFor={captionId}
                      className={cn(labelClass, "mt-3")}
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
                      className={cn(inputClass, "mt-1.5")}
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
                        className="mt-1.5 text-[0.8125rem] text-danger"
                      >
                        {captionError}
                      </p>
                    ) : null}
                    {fileError ? (
                      <p
                        role="alert"
                        className="mt-1.5 text-[0.8125rem] text-danger"
                      >
                        {fileError} Remove this one and upload it again.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface-2/40 px-4 py-5 text-center text-[0.8125rem] leading-relaxed text-muted">
              Nothing uploaded yet. One screenshot of your analytics is enough
              to start.
            </p>
          )}

          {draft.proofs.length < MAX_PROOFS ? (
            <ImageUpload
              kind="proof"
              multiple
              maxFiles={MAX_PROOFS - draft.proofs.length}
              label={
                draft.proofs.length === 0
                  ? "Add screenshots"
                  : "Add more screenshots"
              }
              hint={`Pick several at once. Up to eight in all — room for ${
                MAX_PROOFS - draft.proofs.length
              } more. Each one needs a caption once it is in.`}
              value={null}
              // Called once per file, several times from one pick, so it
              // updates from the current list rather than this render's.
              onChange={(_url, file) => {
                if (!file) return;
                edit((d) =>
                  // The cap holds here too, whatever the uploader was told;
                  // and the same image twice is one screenshot, which also
                  // keeps the url keys on the list below unique.
                  d.proofs.length >= MAX_PROOFS ||
                  d.proofs.some((p) => p.sha256 === file.sha256)
                    ? d
                    : {
                        ...d,
                        proofs: [
                          ...d.proofs,
                          { url: file.url, label: "", sha256: file.sha256 },
                        ],
                      },
                );
              }}
              error={errors.proofs}
            />
          ) : (
            <p className="flex items-center gap-2 text-[0.8125rem] text-muted">
              <CheckIcon
                aria-hidden="true"
                className="size-3.5 text-verified"
              />
              That is the maximum of eight.
            </p>
          )}

          {/* The uploader renders `errors.proofs` while it is on screen. At
              the cap it is not, and the message still needs somewhere to go. */}
          {errors.proofs && draft.proofs.length >= MAX_PROOFS ? (
            <p role="alert" className="text-[0.8125rem] text-danger">
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

          <FieldInfo
            label="About this account"
            info="The fields above cannot carry 'the audience moved from shorts to long-form in March'."
          >
            <TextArea
              id={ids.description}
              name="description"
              label="About this account (optional)"
              hint="What it is, who watches it, how it earns, and anything a buyer would be annoyed to find out later."
              rows={6}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              error={errors.description}
            />
            <p className="mt-1.5 text-xs text-subtle">
              <span className="tabular-nums">{draft.description.length}</span>{" "}
              of 4,000 characters.
            </p>
          </FieldInfo>

          <FieldInfo
            label="WhatsApp number"
            className="sm:max-w-sm"
            info="We use it to reach you if a transfer stalls, which is the one moment email is too slow."
          >
            <TextField
              id={ids.whatsapp}
              name="whatsapp"
              label="WhatsApp number (Channel Adda only)"
              hint="Never shown to buyers."
              inputMode="tel"
              value={draft.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
              error={errors.whatsapp}
              placeholder="+8801712345678"
            />
          </FieldInfo>
        </FormSection>

        <section
          aria-labelledby="listing-requirements-title"
          className="rounded-card border border-line bg-surface shadow-xs"
        >
          {/* What happens after these three is the "how it works" a seller
              reads once, so it is behind the (i) with the rest. */}
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-3.5 sm:px-5">
            <h2
              id="listing-requirements-title"
              className="text-sm leading-6 font-semibold text-fg"
            >
              Before buyers can see it
            </h2>
            <InfoTip label="About what buyers need to see">
              <p>
                A draft saves without any of this. These three are what the next
                button needs.
              </p>
              <p className="mt-1.5">
                After that you get a one-time code to put in your{" "}
                {platform?.name ?? "account"} description. We read it back to
                prove the account is yours: a YouTube channel goes live at once,
                anything else after a moderator looks, usually within a few
                hours.
              </p>
            </InfoTip>
          </div>
          <ul className="flex flex-col gap-2.5 p-4 sm:p-5">
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
        </section>

        {/* The save buttons follow the page down. A draft being safe is the
            thing sellers most need to believe on a form this long, and it
            cannot be believable if the button is only at the bottom. On a
            phone it sits above the tab bar, not behind it, and is one row of
            buttons: the bar and the progress card took half the screen. */}
        <div className="sticky bottom-[calc(4.375rem+env(safe-area-inset-bottom))] z-10 rounded-card border border-line bg-bg/85 p-2.5 shadow-lift backdrop-blur-xl sm:py-2.5 sm:pr-2.5 sm:pl-4 lg:bottom-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p
              aria-live="polite"
              className={cn(
                "flex min-w-0 items-start gap-2 text-xs leading-relaxed text-muted sm:items-center sm:text-[0.8125rem]",
                // The reassurance waits for a wider screen; "saved" does not.
                !saved && "max-sm:hidden",
              )}
            >
              {saved ? (
                <>
                  <CheckIcon
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-verified sm:mt-0"
                  />
                  <span>
                    Draft saved. Still private — nothing is shown to buyers yet.
                  </span>
                </>
              ) : (
                <>
                  <LockIcon
                    aria-hidden="true"
                    className={`mt-0.5 size-3.5 shrink-0 sm:mt-0 ${iconText(LockIcon)}`}
                  />
                  <span>
                    Private to you. Save a draft at any point and come back —
                    half-finished is fine.
                  </span>
                </>
              )}
            </p>
            <div className="flex shrink-0 flex-wrap gap-2 sm:flex-nowrap">
              <Button
                type="submit"
                variant="secondary"
                size="md"
                className="flex-none sm:min-w-[6.5rem]"
                disabled={busy}
              >
                {sending === "draft" ? (
                  <>
                    <Loader2Icon aria-hidden="true" className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save draft"
                )}
              </Button>
              <Button
                type="button"
                size="md"
                className="min-w-0 flex-1 basis-48 sm:flex-none sm:basis-auto sm:min-w-[13.5rem]"
                disabled={busy}
                onClick={() => submit(true)}
              >
                {sending === "review" ? (
                  <>
                    <Loader2Icon aria-hidden="true" className="animate-spin" />
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
