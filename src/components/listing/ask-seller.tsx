"use client";

import { MessagesSquareIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { startConversation } from "@/server/actions/messages";

/**
 * Ask the seller something before committing.
 *
 * This is the only way to reach a seller, and that is the point: the thread it
 * opens is readable by Channel Adda, so a dispute later has a record. There is
 * no email address and no handle anywhere on a listing for the same reason.
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="md"
        disabled={pending}
        onClick={() => {
          if (!session?.user) {
            router.push(`/signin?next=/listing/${listingSlug}`);
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await startConversation(listingId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/dashboard/messages/${result.conversationId}`);
          });
        }}
      >
        <MessagesSquareIcon aria-hidden="true" className="size-4" />
        {pending ? "Opening…" : "Ask the seller a question"}
      </Button>
      {error ? (
        <p role="alert" className="text-center text-xs text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
