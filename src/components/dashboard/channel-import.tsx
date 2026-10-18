"use client";

import {
  CheckIcon,
  CircleAlertIcon,
  LinkIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";
import {
  type CSSProperties,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { InfoTip } from "@/components/app/info-tip";
import {
  hintClass,
  inputClass,
  labelClass,
  Skeleton,
} from "@/components/app/kit";
import {
  FacebookIcon,
  InstagramIcon,
  TelegramIcon,
  WebsiteIcon,
  YouTubeIcon,
} from "@/components/icons/brand-icons";
import { Button } from "@/components/ui/button";
import { normaliseChannelUrl, parseChannelUrl } from "@/lib/channel-url";
import type { PLATFORM_IDS } from "@/lib/listing-form";
import { cn } from "@/lib/utils";
import {
  type LookupResult,
  lookupChannel,
} from "@/server/actions/channel-lookup";

/**
 * The account's link, as the first thing the form asks for — and the thing
 * that fills most of the rest in.
 *
 * Sellers used to type a handle, a title and a subscriber count by hand. Those
 * are what a buyer decides on, so a typo in them is not cosmetic — and handles
 * were wrong often enough to matter. Paste the link instead and, on YouTube
 * and Telegram, the figures come from the platform itself.
 *
 * What comes back is a *confirmation*, not a silent field update: the channel
 * is shown as the platform shows it, every field it would fill is named, and
 * nothing in the form changes until the seller says it is theirs. The one
 * thing worse than typing a subscriber count by hand is publishing somebody
 * else's without noticing.
 */
export type ImportedChannel = Omit<Extract<LookupResult, { ok: true }>, "ok">;

export type PlatformId = (typeof PLATFORM_IDS)[number];

/** The brand marks, by platform. Shared with the platform picker. */
export const PLATFORM_MARK = {
  youtube: YouTubeIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  telegram: TelegramIcon,
  website: WebsiteIcon,
} as const;

/** The platform's colour, for `color-mix()` in class names. */
export const tintStyle = (tint: string) =>
  ({ "--tint": tint }) as CSSProperties;

const ID_OF: Record<string, PlatformId> = {
  YOUTUBE: "youtube",
  INSTAGRAM: "instagram",
  FACEBOOK: "facebook",
  TELEGRAM: "telegram",
  WEBSITE: "website",
};

/**
 * What the link is called, and whether we can read figures from it.
 *
 * The examples always carry the scheme: a link pasted without `https://` used
 * to be rejected by the listing schema, so the example is where that habit
 * is set.
 */
const COPY: Record<
  PlatformId,
  { label: string; placeholder: string; hint: string; fetchable: boolean }
> = {
  youtube: {
    label: "Channel URL",
    placeholder: "https://youtube.com/@yourchannel",
    hint: "From the address bar on your channel's page. We fill in the rest from it.",
    fetchable: true,
  },
  telegram: {
    label: "Channel link",
    placeholder: "https://t.me/yourchannel",
    hint: "The public t.me link from the channel's info. We fill in the rest from it.",
    fetchable: true,
  },
  instagram: {
    label: "Profile URL",
    placeholder: "https://instagram.com/yourpage",
    hint: "Instagram does not share figures with us, so you fill those in below.",
    fetchable: false,
  },
  facebook: {
    label: "Page URL",
    placeholder: "https://facebook.com/yourpage",
    hint: "Facebook does not share figures with us, so you fill those in below.",
    fetchable: false,
  },
  website: {
    label: "Website address",
    placeholder: "https://yoursite.com",
    hint: "The home page, starting with https://.",
    fetchable: false,
  },
};

/** The account's own link, from a bare @name. */
const LINK_FOR: Partial<Record<PlatformId, (name: string) => string>> = {
  youtube: (name) => `https://www.youtube.com/@${name}`,
  telegram: (name) => `https://t.me/${name}`,
  instagram: (name) => `https://www.instagram.com/${name}`,
  facebook: (name) => `https://www.facebook.com/${name}`,
};

/** What the link is called on a platform, for the error summary. */
export const linkLabel = (platform: PlatformId) => COPY[platform].label;

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type Lookup =
  | { kind: "idle" }
  | { kind: "found"; channel: ImportedChannel }
  | { kind: "confirmed"; channel: ImportedChannel; filled: number }
  | { kind: "error"; message: string };

type PlatformInfo = {
  id: PlatformId;
  name: string;
  metricLabel: string;
  tint: string;
};

/** Every field a lookup would fill, in the form's own words. */
export function fieldsFrom(channel: ImportedChannel, metricLabel: string) {
  const fields: string[] = [];
  if (channel.title) fields.push("Title");
  if (channel.handle) fields.push("Handle");
  if (channel.subscribers > 0) fields.push(metricLabel);
  if (channel.ageYears > 0) fields.push("Account age");
  if (channel.country) fields.push("Country");
  if (channel.niche) fields.push("Niche");
  if (channel.engagement !== null) fields.push("Engagement");
  if (channel.avatarUrl) fields.push("Profile picture");
  if (channel.coverUrl) fields.push("Cover image");
  return fields;
}

export function ChannelLinkField({
  id,
  platform,
  names,
  value,
  onChange,
  onPlatform,
  onConfirm,
  error,
  savedUrl,
}: {
  /** The input's id, which the error summary scrolls to. */
  id: string;
  platform: PlatformInfo;
  /** Every platform's name, for saying which one a pasted link belongs to. */
  names: Record<PlatformId, string>;
  value: string;
  onChange: (url: string) => void;
  /** A link from another platform was pasted; the form follows it. */
  onPlatform: (platform: PlatformId) => void;
  /** The seller said the channel is theirs. */
  onConfirm: (channel: ImportedChannel) => void;
  error?: string;
  /** The link already saved on this listing, when one is being edited. */
  savedUrl?: string;
}) {
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [lookup, setLookup] = useState<Lookup>({ kind: "idle" });
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A link replaced while the last one was still being looked up must not
  // have the old answer land on it.
  const ticket = useRef(0);

  const copy = COPY[platform.id];
  const Mark = PLATFORM_MARK[platform.id];

  function run(url: string, target: PlatformId) {
    if (!COPY[target].fetchable || url.trim() === "") return;
    const mine = ++ticket.current;
    setLookup({ kind: "idle" });
    startTransition(async () => {
      const result = await lookupChannel(url);
      if (mine !== ticket.current) return;
      if (!result.ok) {
        setLookup({ kind: "error", message: result.error });
        return;
      }
      const { ok: _ok, ...channel } = result;
      setLookup(channel.manual ? { kind: "idle" } : { kind: "found", channel });
    });
  }

  /** A whole link arrived — pasted, or the field was left. */
  function settle(text: string, andLookUp: boolean) {
    const trimmed = text.trim();
    // A bare @name means the platform already chosen. Left bare it would
    // parse as YouTube's, whatever the seller had picked.
    const bare = trimmed.match(/^@([A-Za-z0-9._-]{2,64})$/)?.[1];
    const toLink = LINK_FOR[platform.id];
    const typed = bare && toLink ? toLink(bare) : trimmed;
    const link = normaliseChannelUrl(typed) ?? typed;
    if (link !== value) onChange(link);

    const parsed = parseChannelUrl(link);
    const detected = parsed ? ID_OF[parsed.platform] : undefined;
    let target = platform.id;
    // Any domain parses as a website, including a mistyped youtube.com, so
    // only a recognised platform is allowed to change the choice.
    if (detected && detected !== "website" && detected !== platform.id) {
      onPlatform(detected);
      target = detected;
      setNote(
        `That is a ${names[detected]} link, so the platform is now ${names[detected]}.`,
      );
    } else {
      setNote(null);
    }
    if (andLookUp) run(link, target);
  }

  const confirm = () => {
    if (lookup.kind !== "found") return;
    onConfirm(lookup.channel);
    setLookup({
      kind: "confirmed",
      channel: lookup.channel,
      filled: fieldsFrom(lookup.channel, platform.metricLabel).length,
    });
  };

  const notMine = () => {
    setLookup({ kind: "idle" });
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const repointing = Boolean(savedUrl) && value.trim() !== savedUrl;

  // A platform picked by hand after the link was pasted. Never for a bare
  // @name, which is the chosen platform's until the field is left.
  const parsedNow = value.trim().startsWith("@")
    ? null
    : parseChannelUrl(value.trim());
  const belongsTo = parsedNow ? ID_OF[parsedNow.platform] : undefined;
  const mismatch =
    belongsTo && belongsTo !== "website" && belongsTo !== platform.id
      ? belongsTo
      : null;
  const described = [hintId, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={tintStyle(platform.tint)}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className={labelClass}>
          {copy.label}
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        </label>
        <InfoTip label={`About the ${copy.label.toLowerCase()}`}>
          It is the account your ownership code is read from and the one a
          moderator opens, so it has to be the one you are selling.
          {copy.fetchable
            ? " We read the name, the picture and the figures from it, so the listing matches what buyers will find."
            : ""}
        </InfoTip>
      </div>

      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Mark
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--tint)]"
          />
          <input
            ref={inputRef}
            id={id}
            name="sourceUrl"
            // Text, not url, and not `required`: the browser's own check
            // would refuse a bare @name and block "Save draft", which is
            // allowed to go without the link. Review asks for it instead.
            type="text"
            inputMode="url"
            value={value}
            onChange={(event) => {
              // A different link makes whatever was found stale.
              ticket.current += 1;
              setLookup({ kind: "idle" });
              setNote(null);
              onChange(event.target.value);
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              // Only a whole link or @name is taken over — anything else
              // pastes as the browser would.
              if (!parseChannelUrl(text.trim())) return;
              event.preventDefault();
              ticket.current += 1;
              settle(text, true);
            }}
            onBlur={(event) => {
              if (event.target.value.trim()) settle(event.target.value, false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Never the form's submit: Enter here means "look it up".
                event.preventDefault();
                settle(event.currentTarget.value, true);
              }
            }}
            placeholder={copy.placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={described}
            className={cn(inputClass, "pl-9")}
          />
        </div>
        {copy.fetchable ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="w-full sm:w-auto sm:min-w-[8.25rem]"
            disabled={pending || value.trim() === ""}
            onClick={() => settle(value, true)}
          >
            {pending ? (
              <Loader2Icon aria-hidden="true" className="animate-spin" />
            ) : (
              <SearchIcon aria-hidden="true" />
            )}
            {pending ? "Fetching…" : "Fetch details"}
          </Button>
        ) : null}
      </div>

      <p id={hintId} className={hintClass}>
        {copy.hint}
      </p>

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-[0.8125rem] text-danger"
        >
          {error}
        </p>
      ) : null}

      {note ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted animate-rise">
          <Mark aria-hidden="true" className="size-3.5 text-[var(--tint)]" />
          {note}
        </p>
      ) : mismatch ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-primary-text">
          <CircleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          <span>
            That is a {names[mismatch]} link. Pick {names[mismatch]} above, or
            paste the {platform.name} account's link instead.
          </span>
        </p>
      ) : null}

      {repointing ? (
        <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <LinkIcon
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-subtle"
          />
          <span>
            Pasting a different link re-points the listing at that account, and
            an ownership check that has already passed starts again.
          </span>
        </p>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {pending
          ? "Looking up that link."
          : lookup.kind === "found"
            ? `Found ${lookup.channel.title || "the channel"}. Check it is yours.`
            : lookup.kind === "confirmed"
              ? "Filled in from the channel."
              : ""}
      </p>

      {pending ? <PreviewSkeleton /> : null}

      {lookup.kind === "error" && !pending ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft/60 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-fg"
        >
          <CircleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-danger"
          />
          <span>{lookup.message}</span>
        </p>
      ) : null}

      {lookup.kind === "found" && !pending ? (
        <ChannelPreview
          channel={lookup.channel}
          platform={platform}
          onConfirm={confirm}
          onReject={notMine}
        />
      ) : null}

      {lookup.kind === "confirmed" ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-line bg-surface-2/50 px-3 py-2 animate-rise">
          <Avatar channel={lookup.channel} platform={platform} size="sm" />
          <p className="min-w-0 flex-1 text-[0.8125rem] leading-5 text-muted">
            <span className="font-medium text-fg">
              {lookup.channel.title || "Channel"}
            </span>{" "}
            — filled in <span className="tabular-nums">{lookup.filled}</span>{" "}
            {lookup.filled === 1 ? "field" : "fields"}. Check them below.
          </p>
          <span
            aria-hidden="true"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-verified-soft text-verified ring-1 ring-verified/20 ring-inset"
          >
            <CheckIcon className="size-3" strokeWidth={3} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Avatar({
  channel,
  platform,
  size,
}: {
  channel: ImportedChannel;
  platform: PlatformInfo;
  size: "sm" | "lg";
}) {
  const Mark = PLATFORM_MARK[platform.id];
  const box = size === "lg" ? "size-14" : "size-6";
  if (channel.avatarUrl) {
    return (
      <>
        {/* biome-ignore lint/performance/noImgElement: our own copy of the
            channel's picture, already sized; next/image would re-encode it. */}
        <img
          src={channel.avatarUrl}
          alt=""
          width={size === "lg" ? 56 : 24}
          height={size === "lg" ? 56 : 24}
          className={cn(
            box,
            "shrink-0 rounded-full bg-surface-2 object-cover",
            size === "lg" && "ring-4 ring-surface dark:ring-surface-2",
          )}
        />
      </>
    );
  }
  return (
    <span
      className={cn(
        box,
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--tint)_12%,var(--color-surface))] text-[var(--tint)]",
        size === "lg" && "ring-4 ring-surface dark:ring-surface-2",
      )}
    >
      <Mark
        aria-hidden="true"
        className={size === "lg" ? "size-6" : "size-3"}
      />
    </span>
  );
}

function PreviewSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mt-3 overflow-hidden rounded-lg border border-line bg-surface dark:bg-surface-2"
    >
      <Skeleton className="h-20 rounded-none sm:h-24" />
      <div className="px-4 pb-4">
        <Skeleton className="-mt-7 size-14 rounded-full ring-4 ring-surface dark:ring-surface-2" />
        <Skeleton className="mt-3 h-4 w-2/5" />
        <Skeleton className="mt-2 h-3 w-1/4" />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton key={key} className="h-12 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The channel as the platform shows it, for the seller to recognise. */
function ChannelPreview({
  channel,
  platform,
  onConfirm,
  onReject,
}: {
  channel: ImportedChannel;
  platform: PlatformInfo;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const Mark = PLATFORM_MARK[platform.id];
  const fields = fieldsFrom(channel, platform.metricLabel);
  const reach = platform.id === "telegram";

  const stats = [
    channel.subscribers > 0
      ? {
          label: platform.metricLabel,
          value: compact.format(channel.subscribers),
        }
      : channel.subscribersHidden
        ? { label: platform.metricLabel, value: "Hidden" }
        : null,
    channel.videos !== null
      ? { label: "Videos", value: compact.format(channel.videos) }
      : null,
    channel.views !== null
      ? { label: "Views", value: compact.format(channel.views) }
      : null,
    channel.ageYears > 0
      ? {
          label: `On ${platform.name}`,
          value: `${channel.ageYears} ${channel.ageYears === 1 ? "year" : "years"}`,
        }
      : null,
    channel.engagement !== null
      ? {
          label: reach ? "Post reach" : "Engagement",
          value: `${channel.engagement}%`,
        }
      : null,
  ].filter((stat): stat is { label: string; value: string } => stat !== null);

  return (
    <section
      aria-label="The channel we found"
      className="mt-3 overflow-hidden rounded-lg border border-line bg-surface shadow-xs animate-rise dark:bg-surface-2"
    >
      {channel.coverUrl ? (
        <>
          {/* biome-ignore lint/performance/noImgElement: our own copy of the
              channel's banner; the strip shown is its centre, as on YouTube. */}
          <img
            src={channel.coverUrl}
            alt=""
            width={1600}
            height={900}
            className="h-20 w-full object-cover sm:h-24"
          />
        </>
      ) : (
        <div className="h-14 bg-[color-mix(in_oklab,var(--tint)_9%,transparent)]" />
      )}

      <div className="px-4 pb-4">
        <div className="-mt-7">
          <Avatar channel={channel} platform={platform} size="lg" />
        </div>
        <p className="mt-2 truncate text-[0.9375rem] leading-6 font-semibold text-fg">
          {channel.title || channel.handle || "Channel found"}
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] leading-5 text-muted">
          <Mark
            aria-hidden="true"
            className="size-3.5 shrink-0 text-[var(--tint)]"
          />
          <span className="truncate">
            {channel.handle ? `@${channel.handle}` : channel.canonicalUrl}
          </span>
        </p>

        {stats.length > 0 ? (
          <dl className="mt-3.5 grid grid-cols-2 gap-2 sm:flex">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="min-w-0 flex-1 rounded-md bg-surface-2/70 px-3 py-2 dark:bg-surface-3/40"
              >
                <dt className="truncate text-xs text-subtle">{stat.label}</dt>
                <dd className="mt-0.5 text-[0.9375rem] leading-5 font-semibold text-fg tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {fields.length > 0 ? (
          <div className="mt-3.5">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              Fills in
              {channel.engagementBasis ? (
                <InfoTip label="About the engagement estimate">
                  Engagement is an estimate from {channel.engagementBasis}.
                  Change it if your own analytics say otherwise.
                </InfoTip>
              ) : null}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {fields.map((field) => (
                <li
                  key={field}
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-line bg-surface px-2 text-xs font-medium text-fg dark:bg-surface-2"
                >
                  <CheckIcon
                    aria-hidden="true"
                    className="size-3 text-verified"
                    strokeWidth={2.5}
                  />
                  {field}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-3 text-xs leading-relaxed text-subtle">
          {channel.subscribersHidden
            ? "This channel hides its subscriber count, so enter the audience yourself below. "
            : ""}
          Anything you have already typed is kept — change any of it by hand.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            size="md"
            className="w-full sm:w-auto"
            onClick={onConfirm}
          >
            <CheckIcon aria-hidden="true" />
            Yes, this is my account
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="w-full sm:w-auto"
            onClick={onReject}
          >
            No — paste another link
          </Button>
        </div>
      </div>
    </section>
  );
}
