"use client";

import { CheckIcon, UndoDotIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/app/kit";
import { FormNotice, TextArea } from "@/components/auth/fields";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import { KYC_REASON_MAX, KYC_REASON_MIN } from "@/lib/kyc";
import { approveVerification, rejectVerification } from "@/server/actions/kyc";

/**
 * The reasons staff give most, a tap each: written to be read by the member,
 * who has to act on them. Any of them can be edited before sending.
 */
const QUICK_REASONS = [
  "The photo of your ID is blurry. Take it again in good light.",
  "Part of your ID is cut off or covered. Show all four corners.",
  "Your face or your ID is not clear in the video.",
  "The name you typed does not match your ID.",
];

/**
 * Approve, or say what to fix.
 *
 * Approving is one tap and says what it does: the badge appears at once.
 * Not approving needs a reason, because the member reads it word for word in
 * the app and in an email, and has to act on it. Neither is red: turning a
 * check down is not destructive — they can send it again.
 */
export function VerificationDecision({
  submissionId,
}: {
  submissionId: string;
}) {
  const router = useRouter();
  const reasonId = useId();
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready =
    reason.trim().length >= KYC_REASON_MIN &&
    reason.trim().length <= KYC_REASON_MAX;

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "That did not work. Try again.");
        return;
      }
      router.push("/admin/verification");
      router.refresh();
    });
  }

  return (
    <Card className="border-primary/40">
      <CardHeader
        as="h2"
        title="Your decision"
        description="Recorded against your name in the audit trail. They are told in the app and by email."
      />
      <CardBody>
        {error ? <FormNotice>{error}</FormNotice> : null}

        {mode === "idle" ? (
          <>
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              Approve only if the photo on the ID is the person in the video,
              they hold the same ID, and they say their name and “Channel Adda”.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-col">
              <Button
                type="button"
                size="md"
                className="w-full sm:w-auto lg:w-full"
                disabled={pending}
                onClick={() => act(() => approveVerification(submissionId))}
              >
                <CheckIcon aria-hidden="true" />
                <BusyLabel
                  busy={pending}
                  idle="Approve and show the badge"
                  working="Approving…"
                />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                className="w-full sm:w-auto lg:w-full"
                disabled={pending}
                onClick={() => setMode("rejecting")}
              >
                <UndoDotIcon aria-hidden="true" />
                Not approved
              </Button>
            </div>
          </>
        ) : (
          <>
            <TextArea
              id={reasonId}
              name="reason"
              label="What should they fix?"
              hint="They see this word for word. They can then send their ID again."
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={KYC_REASON_MAX}
              placeholder="The photo of your ID is blurry. Take it again in good light."
              required
            />
            <div className="mt-2.5 flex flex-wrap gap-2">
              {QUICK_REASONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => setReason(text)}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 py-1.5 text-left text-xs leading-snug text-muted transition-colors duration-150 hover:border-line-strong hover:text-fg pointer-fine:min-h-8 dark:bg-surface-2"
                >
                  {text}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="md"
                disabled={pending || !ready}
                onClick={() =>
                  act(() => rejectVerification(submissionId, reason))
                }
              >
                <BusyLabel
                  busy={pending}
                  idle="Send it back"
                  working="Sending…"
                />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                disabled={pending}
                onClick={() => {
                  setMode("idle");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
            {reason.trim().length > 0 &&
            reason.trim().length < KYC_REASON_MIN ? (
              <p className="mt-2 text-xs text-subtle">
                A few more words — this is the whole message.
              </p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
