"use client";

import { ArrowLeftRightIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/app/kit";
import { TextField } from "@/components/auth/fields";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import type { DealLevel } from "@/generated/prisma/enums";
import { levelLabel } from "@/lib/custody-roles";
import { cn } from "@/lib/utils";
import { setMyAgentIdentity } from "@/server/actions/admin-users";

/**
 * The address sellers invite when you run their deal, kept by you.
 *
 * Copied onto each deal as you take it, so nobody types it per deal and a
 * seller never gets a typo. Changing it applies to the deals you take next;
 * one already running keeps the address its seller was given.
 */
export function MyDeskIdentity({
  email: storedEmail,
  brand: storedBrand,
  level,
}: {
  email: string | null;
  brand: string | null;
  level: DealLevel | null;
}) {
  const emailId = useId();
  const brandId = useId();
  const [email, setEmail] = useState(storedEmail ?? "");
  const [brand, setBrand] = useState(storedBrand ?? "Channel Adda Transfers");
  const [saved, setSaved] = useState({
    email: storedEmail ?? "",
    brand: storedBrand ?? "",
  });
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = email.trim() !== saved.email || brand.trim() !== saved.brand;

  return (
    <Card>
      <CardHeader
        as="h2"
        icon={ArrowLeftRightIcon}
        title="Your deal desk"
        info="The account sellers invite when you run their deal, and the name they see it as. Copied onto each deal as you take it."
      />
      <CardBody>
        <p className="mb-4 text-[0.8125rem] text-muted">
          You run{" "}
          <span className="font-medium text-fg">
            {levelLabel(level).toLowerCase()}
          </span>{" "}
          deals. Only the superadmin changes that.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setNote(null);
            setError(null);
            startTransition(async () => {
              const result = await setMyAgentIdentity(email, brand);
              if (result.ok) {
                setNote(result.message);
                setSaved({
                  email: email.trim().toLowerCase(),
                  brand: brand.trim(),
                });
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={emailId}
              name="agentEmail"
              type="email"
              label="Google account sellers invite"
              hint="The account that will genuinely own the channels you hold."
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="transfers@channeladda.com"
              autoComplete="off"
              required
            />
            <TextField
              id={brandId}
              name="agentBrand"
              label="Shown to the seller as"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              placeholder="Channel Adda Transfers"
              autoComplete="off"
              required
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="submit"
              size="sm"
              variant={dirty ? "primary" : "secondary"}
              disabled={pending || !dirty}
            >
              <BusyLabel
                busy={pending}
                idle={dirty ? "Save" : "Saved"}
                working="Saving…"
              />
            </Button>
            {note || error ? (
              <p
                role="status"
                className={cn(
                  "text-xs leading-relaxed",
                  error ? "text-danger" : "text-muted",
                )}
              >
                {error ?? note}
              </p>
            ) : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
