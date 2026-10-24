"use client";

import { CheckIcon, ExternalLinkIcon, StarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TextArea } from "@/components/auth/fields";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  submitPlatformReview,
  submitSellerReview,
} from "@/server/actions/reviews";

type Given = { rating: number; body: string } | null;

export type ReviewPromptView = {
  orderId: string;
  viewer: "buyer" | "seller";
  sellerName: string;
  seller: Given;
  platform: Given;
};

const WORDS = ["", "Bad", "Poor", "OK", "Good", "Excellent"] as const;
const MAX = 500;

/**
 * What a completed deal's chat asks next: the buyer rates the seller, then
 * the buyer — and the seller — rate Channel Adda. One card at a time, each
 * folding to a line once answered, so the chat ends on the thing to do.
 *
 * After four or five stars for Channel Adda, the Google link: Google does
 * not show stars a site collects about itself, so a review only helps there
 * if it is posted there.
 */
export function ReviewPrompts({
  prompt,
  googleReviewUrl,
}: {
  prompt: ReviewPromptView;
  googleReviewUrl: string | null;
}) {
  const [seller, setSeller] = useState<Given>(prompt.seller);
  const [platform, setPlatform] = useState<Given>(prompt.platform);
  const [justRated, setJustRated] = useState<number | null>(null);
  const firstName = prompt.sellerName.split(/\s+/)[0] || prompt.sellerName;
  const buyer = prompt.viewer === "buyer";

  return (
    <section aria-label="Reviews" className="flex flex-col gap-3">
      {buyer ? (
        seller ? (
          <Done text={`You gave ${firstName}`} rating={seller.rating} />
        ) : (
          <Ask
            title={`How was ${firstName} as a seller?`}
            placeholder={`Tell other buyers how it went with ${firstName} (optional)`}
            send={(rating, body) =>
              submitSellerReview(prompt.orderId, rating, body)
            }
            onDone={(rating, body) => setSeller({ rating, body })}
          />
        )
      ) : null}

      {buyer && !seller ? null : platform ? (
        <>
          <Done text="You gave Channel Adda" rating={platform.rating} />
          {justRated !== null && justRated >= 4 && googleReviewUrl ? (
            <div className="rounded-card border border-line bg-surface p-4">
              <p className="text-sm font-medium text-fg">
                Thank you! Would you say it on Google too?
              </p>
              <p className="mt-1 text-[0.8125rem] text-muted">
                It takes a minute and helps other people find a safe place to
                buy and sell.
              </p>
              <Button asChild size="sm" variant="secondary" className="mt-3">
                <a href={googleReviewUrl} target="_blank" rel="noopener">
                  Review us on Google
                  <ExternalLinkIcon aria-hidden="true" />
                </a>
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <Ask
          title="How was Channel Adda?"
          placeholder="What went well, or what should we do better? (optional)"
          send={(rating, body) =>
            submitPlatformReview(prompt.orderId, rating, body)
          }
          onDone={(rating, body) => {
            setPlatform({ rating, body });
            setJustRated(rating);
          }}
        />
      )}
    </section>
  );
}

/** One question: stars, a few optional words, and the button. */
function Ask({
  title,
  placeholder,
  send,
  onDone,
}: {
  title: string;
  placeholder: string;
  send: (
    rating: number,
    body: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDone: (rating: number, body: string) => void;
}) {
  const router = useRouter();
  const bodyId = useId();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="rounded-card border border-primary/40 bg-surface p-4 shadow-xs sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (rating === 0) {
          setError("Tap a star to choose your rating.");
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await send(rating, body);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onDone(rating, body.trim());
          router.refresh();
        });
      }}
    >
      <h3 className="text-[0.9375rem] font-semibold text-fg">{title}</h3>
      <StarPicker value={rating} onChange={setRating} label={title} />
      <TextArea
        id={bodyId}
        label="Your review"
        className="mt-3 [&>label]:sr-only"
        placeholder={placeholder}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={MAX}
        rows={2}
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" size="md" disabled={pending}>
          <BusyLabel busy={pending} idle="Post review" working="Posting…" />
        </Button>
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : (
          <p className="text-xs text-subtle">Shown with your first name.</p>
        )}
      </div>
    </form>
  );
}

/**
 * Five stars as five radio buttons: arrow keys move between them, a screen
 * reader hears "4 stars, Good", and a thumb gets a 44px target each.
 */
function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className="mt-2">
      <legend className="sr-only">{label}</legend>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-lg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
            />
            <span className="sr-only">
              {star} {star === 1 ? "star" : "stars"}, {WORDS[star]}
            </span>
            <StarIcon
              aria-hidden="true"
              className={cn(
                "size-8 transition-[color,fill,scale] duration-100",
                star <= shown
                  ? "scale-105 fill-primary text-primary"
                  : "fill-transparent text-line-strong",
              )}
            />
          </label>
        ))}
        <span
          aria-hidden="true"
          className="ml-2 text-sm font-medium text-muted"
        >
          {WORDS[shown]}
        </span>
      </div>
    </fieldset>
  );
}

/** An answered question, folded to one line. */
function Done({ text, rating }: { text: string; rating: number }) {
  return (
    <p className="flex items-center gap-2 rounded-card border border-verified/25 bg-verified-soft px-4 py-3 text-sm text-fg">
      <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-verified" />
      <span>{text}</span>
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <StarIcon
            key={star}
            className={cn(
              "size-3.5",
              star <= rating
                ? "fill-primary text-primary"
                : "fill-transparent text-line-strong",
            )}
          />
        ))}
      </span>
      <span className="sr-only">
        {rating} {rating === 1 ? "star" : "stars"}
      </span>
    </p>
  );
}
