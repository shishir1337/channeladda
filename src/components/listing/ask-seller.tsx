"use client";

import { MessagesSquareIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { textareaClass } from "@/components/app/kit";
import { BusyLabel } from "@/components/deals/deal-timeline";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { OPENING_MESSAGE } from "@/lib/chat-opening";
import { MAX_MESSAGE } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { askSellerQuestion } from "@/server/actions/messages";

/**
 * Ask the seller something before committing.
 *
 * This is the only way to reach a seller, and that is the point: the thread it
 * opens is readable by Channel Adda, so a dispute later has a record. There is
 * no email address and no handle anywhere on a listing for the same reason.
 *
 * It opens a box with a ready question in it rather than sending one: on one
 * click the standard opener used to go out as the buyer before they could
 * change a word of it.
 */
export function AskSeller({
  listingId,
  listingSlug,
}: {
  listingId: string;
  listingSlug: string;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(OPENING_MESSAGE);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={() => {
          if (!session?.user) {
            router.push(`/signin?next=/listing/${listingSlug}`);
            return;
          }
          setOpen(true);
        }}
      >
        <MessagesSquareIcon aria-hidden="true" className="size-4" />
        Ask the seller a question
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await askSellerQuestion(listingId, question);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/dashboard/messages/${result.conversationId}`);
        });
      }}
    >
      <label htmlFor={fieldId} className="text-sm font-medium text-fg">
        Your question for the seller
      </label>
      <textarea
        id={fieldId}
        rows={4}
        value={question}
        maxLength={MAX_MESSAGE}
        onChange={(e) => setQuestion(e.target.value)}
        className={cn(textareaClass, "text-sm")}
      />
      <p className="text-xs leading-relaxed text-subtle">
        Phone numbers, emails and links are removed: deals stay on Channel Adda
        so we can protect them.
      </p>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="secondary"
          size="md"
          disabled={pending || !question.trim()}
        >
          <BusyLabel busy={pending} busyText="Sending…">
            Send question
          </BusyLabel>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
