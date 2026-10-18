"use client";

import {
  CheckIcon,
  CircleAlertIcon,
  LinkIcon,
  Loader2Icon,
  PencilIcon,
  SearchIcon,
} from "lucide-react";
import { useId, useState, useTransition } from "react";
import { InfoTip } from "@/components/app/info-tip";
import { IconTile, Skeleton } from "@/components/app/kit";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { lookupChannel } from "@/server/actions/channel-lookup";

/**
 * Starting a listing from the channel link.
 *
 * Sellers used to type a handle, a title and a subscriber count by hand. Those
 * three are what a buyer decides on, so a typo in them is not cosmetic — and
 * handles were wrong often enough to matter. Paste the link instead and the
 * figures come from Google.
 *
 * When the lookup cannot run — no API key, or a platform with no public API —
 * the fields are left for the seller to fill and it says so, rather than
 * silently showing zeros as though they were facts.
 *
 * What comes back is a *confirmation*, not a silent field update: every value
 * taken from the link is named, and the seller says yes to it. The one thing
 * worse than typing a subscriber count by hand is publishing somebody else's
 * without noticing.
 */
export type ImportedChannel = {
  platform: string;
  channelId: string | null;
  /** The @name, when the link or Google gave us one. */
  handle: string | null;
  title: string;
  description: string;
  avatarUrl: string | null;
  subscribers: number;
  subscribersHidden: boolean;
  ageYears: number;
  country: string | null;
  canonicalUrl: string;
  manual: boolean;
};

/**
 * Examples, always carrying the scheme.
 *
 * A link pasted without `https://` is kept as-is and then rejected by the
 * listing schema, so the example is where that habit has to be set.
 */
const EXAMPLES = [
  "https://youtube.com/@yourchannel",
  "https://instagram.com/yourpage",
  "https://t.me/yourchannel",
];

/** What the lookup actually filled in, in the seller's words. */
function filledIn(channel: ImportedChannel) {
  const rows: { label: string; value: string }[] = [];
  if (channel.handle) rows.push({ label: "Handle", value: channel.handle });
  if (channel.title) rows.push({ label: "Name", value: channel.title });
  if (channel.subscribers > 0) {
    rows.push({
      label: "Audience",
      value: channel.subscribers.toLocaleString("en-US"),
    });
  }
  if (channel.ageYears > 0) {
    rows.push({ label: "Account age", value: `${channel.ageYears} years` });
  }
  if (channel.country) {
    rows.push({ label: "Main country", value: channel.country });
  }
  return rows;
}

export function ChannelImport({
  onImported,
  currentUrl,
}: {
  onImported: (channel: ImportedChannel) => void;
  /** The link already saved on this listing, when one is being edited. */
  currentUrl?: string;
}) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [imported, setImported] = useState<ImportedChannel | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await lookupChannel(url);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { ok: _ok, ...channel } = result;
      setImported(channel);
      setConfirmed(false);
      onImported(channel);
    });
  };

  const again = () => {
    setImported(null);
    setConfirmed(false);
    setError(null);
    setUrl("");
  };

  // Confirmed: collapsed to a single line, so a step the seller has finished
  // stops leading a form they are halfway through.
  if (imported && confirmed) {
    return (
      <section className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-xs sm:px-5">
        <span
          aria-hidden="true"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-verified-soft text-verified ring-1 ring-verified/20 ring-inset"
        >
          <CheckIcon className="size-3" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-5 font-medium text-fg">
            {imported.title || imported.handle || "Link saved"}
          </p>
          <p className="truncate text-[0.8125rem] leading-5 text-muted">
            Linked to this listing. The rest of the form is below.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={again}>
          <PencilIcon aria-hidden="true" />
          Change link
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="rounded-card border border-line bg-surface shadow-xs"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <IconTile icon={LinkIcon} size="sm" />
        <div className="flex min-w-0 items-center gap-1.5">
          <h2
            id={`${id}-heading`}
            className="text-sm leading-6 font-semibold text-fg"
          >
            Start from your channel link
          </h2>
          {/* The field's own hint says what to paste; why it is worth it is
              one tap away. */}
          <InfoTip label="About the channel link">
            Paste the link you see when you open the channel. We read the name,
            the picture and the subscriber count from it, so the listing matches
            what buyers will find.
          </InfoTip>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <TextField
              id={id}
              name="sourceUrl"
              label="Channel link"
              hint="Paste the whole link, starting with https:// — YouTube, Instagram, Telegram, Facebook or a website."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  run();
                }
              }}
              placeholder="https://youtube.com/@yourchannel"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button
            type="button"
            size="md"
            className="w-full sm:w-auto sm:min-w-[8.5rem]"
            disabled={pending || url.trim() === ""}
            onClick={run}
          >
            {pending ? (
              <>
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                Looking…
              </>
            ) : (
              <>
                <SearchIcon aria-hidden="true" />
                Fetch details
              </>
            )}
          </Button>
        </div>

        <p aria-live="polite" className="sr-only">
          {pending ? "Looking up that link." : ""}
        </p>

        {!imported && !pending ? (
          <>
            <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
              {EXAMPLES.map((example) => (
                <li key={example} className="font-mono text-xs text-subtle">
                  {example}
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-xs leading-relaxed text-subtle">
              No link to hand? Skip this and fill the form in yourself — nothing
              here is needed to save a draft.
            </p>
          </>
        ) : null}

        {currentUrl && !imported ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
            <LinkIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-subtle"
            />
            <div className="min-w-0">
              <p className="text-xs text-subtle">
                This listing is already linked to
              </p>
              <p className="mt-0.5 text-[0.8125rem] font-medium break-all text-fg">
                {currentUrl}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Pasting a different link re-points the listing at that account,
                and an ownership check that has already passed starts again.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft/60 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-fg"
          >
            <CircleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-danger"
            />
            <span>{error}</span>
          </p>
        ) : null}

        {pending ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-line p-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <span className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="mt-2 h-3 w-3/4" />
            </span>
          </div>
        ) : null}

        {imported && !pending ? (
          <div className="mt-4 animate-rise overflow-hidden rounded-lg border border-line">
            <div className="flex items-center gap-3 bg-surface-2/50 px-3 py-3 sm:px-4">
              {imported.avatarUrl ? (
                <>
                  {/* biome-ignore lint/performance/noImgElement: the channel's
                      own avatar, at 56px straight from the platform's CDN. */}
                  <img
                    src={imported.avatarUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="size-10 shrink-0 rounded-full border border-line object-cover"
                  />
                </>
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-subtle">
                  <LinkIcon aria-hidden="true" className="size-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm leading-5 font-semibold text-fg">
                  {imported.manual
                    ? "Link accepted"
                    : imported.title || "Channel found"}
                </p>
                <p className="text-[0.8125rem] leading-5 text-muted">
                  {imported.manual
                    ? "We cannot read figures from this platform automatically."
                    : "Is this the account you are selling?"}
                </p>
              </div>
            </div>

            {imported.manual ? (
              <p className="border-t border-line px-3 py-3 text-[0.8125rem] leading-relaxed text-muted sm:px-4">
                Your link is saved with the listing so a moderator can open the
                account and check it. Fill in the audience, the age and the rest
                below — a moderator compares them against the live account, so
                put down what is actually there.
              </p>
            ) : (
              <>
                <dl>
                  {filledIn(imported).map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center gap-2.5 border-t border-line px-3 py-2.5 sm:px-4"
                    >
                      <CheckIcon
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-verified"
                      />
                      <dt className="shrink-0 text-[0.8125rem] text-muted">
                        {row.label}
                      </dt>
                      <dd className="min-w-0 flex-1 truncate text-right text-sm font-medium text-fg tabular-nums">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="border-t border-line px-3 py-2.5 text-xs leading-relaxed text-subtle sm:px-4">
                  {imported.subscribersHidden
                    ? "This channel hides its subscriber count, so enter the audience yourself below. "
                    : ""}
                  Filled into the form below. Anything you had already written
                  was kept — change any of it by hand.
                </p>
              </>
            )}

            <div className="flex flex-col gap-2 border-t border-line px-3 py-3 sm:flex-row sm:px-4">
              <Button
                type="button"
                size="md"
                className="w-full sm:w-auto"
                onClick={() => setConfirmed(true)}
              >
                <CheckIcon aria-hidden="true" />
                {imported.manual
                  ? "Got it — continue"
                  : "Yes, this is my account"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="w-full sm:w-auto"
                onClick={again}
              >
                No — paste another link
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
