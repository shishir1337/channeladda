"use client";

import { UserRoundCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Card } from "@/components/app/kit";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import type { DealMode, Platform } from "@/generated/prisma/enums";
import type { DealActor } from "@/lib/deal-machine";
import { handoverTarget, parseHandoverTo } from "@/lib/handover-target";
import { cn } from "@/lib/utils";
import { changeHandoverTo } from "@/server/actions/deals";

/**
 * The buyer's own account that receives ownership, on the deal itself.
 *
 * Whoever transfers — the seller on Fastest, our agent on Safest — reads it
 * here, the same address their email gave them, until the channel has gone
 * to it. The buyer sees what they named and can correct it until the step
 * that first uses it is done. The server has already left it out of a
 * Safest seller's view.
 */
export function HandoverAccount({
  dealId,
  viewerRole,
  mode,
  platform,
  handoverTo,
  open,
  inUse,
}: {
  dealId: string;
  viewerRole: DealActor;
  mode: DealMode;
  platform: Platform;
  handoverTo: string | null;
  /** The step that first uses it is not done yet: the buyer may change it. */
  open: boolean;
  /** The channel has not gone to it yet, so it is still needed on screen. */
  inUse: boolean;
}) {
  const router = useRouter();
  const target = handoverTarget(platform);
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(handoverTo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!inUse) return null;
  const buyer = viewerRole === "buyer";
  if (!buyer && !handoverTo) return null;
  if (viewerRole === "seller" && mode === "SAFEST") return null;

  const save = () => {
    const parsed = parseHandoverTo(platform, value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await changeHandoverTo(dealId, parsed.value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  const showForm = buyer && open && (editing || !handoverTo);

  return (
    <Card>
      <section aria-labelledby={`${inputId}-heading`}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <UserRoundCheckIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-subtle"
          />
          <h2
            id={`${inputId}-heading`}
            className="min-w-0 flex-1 text-sm leading-6 font-semibold text-fg"
          >
            {buyer ? "Ownership goes to" : "Give ownership to this account"}
          </h2>
          {buyer && open && handoverTo && !editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Change
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 p-4 sm:p-5">
          {showForm ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
              className="flex flex-col gap-2"
            >
              <label
                htmlFor={inputId}
                className="text-[0.8125rem] font-medium text-fg"
              >
                {target.label}
              </label>
              <input
                id={inputId}
                type={platform === "TELEGRAM" ? "text" : "email"}
                autoCapitalize="none"
                spellCheck={false}
                value={value}
                placeholder={target.placeholder}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${inputId}-hint`}
                disabled={pending}
                className={cn(
                  "h-11 w-full rounded-lg border bg-surface px-3 text-sm text-fg shadow-xs transition-colors duration-150 placeholder:text-subtle hover:border-line-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 pointer-fine:h-9 dark:bg-surface-2",
                  error ? "border-danger" : "border-line",
                )}
              />
              <p
                id={`${inputId}-hint`}
                className={cn(
                  "text-xs leading-relaxed",
                  error ? "text-danger" : "text-subtle",
                )}
              >
                {error ?? target.hint}
              </p>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending}>
                  <BusyLabel busy={pending} idle="Save" working="Saving…" />
                </Button>
                {handoverTo ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setEditing(false);
                      setValue(handoverTo);
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          ) : (
            <>
              <p className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 font-mono text-[0.8125rem] leading-relaxed break-all text-fg select-all">
                {handoverTo}
              </p>
              <p className="text-xs leading-relaxed text-subtle">
                {buyer
                  ? open
                    ? "Whoever transfers the account uses exactly this. You can correct it until they do."
                    : "It is in use now, so it can no longer change. If something is wrong, say so in the chat."
                  : "The buyer named it before paying. Use exactly this account, nothing they write in the chat instead."}
              </p>
            </>
          )}
        </div>
      </section>
    </Card>
  );
}
