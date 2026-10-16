"use client";

import { CheckCircle2Icon, LinkIcon, SearchIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";
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
 */
export type ImportedChannel = {
  platform: string;
  channelId: string | null;
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

export function ChannelImport({
  onImported,
}: {
  onImported: (channel: ImportedChannel) => void;
}) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [imported, setImported] = useState<ImportedChannel | null>(null);
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
      onImported(channel);
    });
  };

  return (
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">
        Start from your channel link
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Paste the link you see in your browser when you open the channel. We
        read the name, picture and subscriber count from it so the listing
        matches what buyers will find.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <TextField
            id={id}
            name="sourceUrl"
            label="Channel link"
            hint="youtube.com/@yourchannel — or an Instagram, Telegram, Facebook or website address."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                run();
              }
            }}
          />
        </div>
        <Button
          type="button"
          size="md"
          disabled={pending || url.trim() === ""}
          onClick={run}
        >
          <SearchIcon aria-hidden="true" className="size-4" />
          {pending ? "Looking…" : "Fetch details"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {imported ? (
        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface-2 p-4">
          {imported.avatarUrl ? (
            <img
              src={imported.avatarUrl}
              alt=""
              className="size-14 shrink-0 rounded-full border border-line"
            />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-line text-xs text-subtle">
              <LinkIcon aria-hidden="true" className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              {imported.manual ? (
                "Link accepted"
              ) : (
                <>
                  <CheckCircle2Icon
                    aria-hidden="true"
                    className="size-4 text-verified"
                  />
                  {imported.title}
                </>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {imported.manual ? (
                <>
                  We cannot read figures from this one automatically — fill in
                  the audience and the rest below and a moderator will check
                  them against the live account.
                </>
              ) : imported.subscribersHidden ? (
                <>
                  This channel hides its subscriber count, so enter it yourself
                  below. {imported.platform} · {imported.ageYears} years old
                </>
              ) : (
                <>
                  {imported.subscribers.toLocaleString("en-US")} subscribers ·{" "}
                  {imported.ageYears} years old
                  {imported.country ? ` · ${imported.country}` : ""}
                </>
              )}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
