"use client";

import { ArrowLeftRightIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/app/kit";
import { TextField } from "@/components/auth/fields";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import type { DealLevel } from "@/generated/prisma/enums";
import { levelLabel } from "@/lib/custody-roles";
import { IDENTITY_FIELDS } from "@/lib/transfer-identity";
import { cn } from "@/lib/utils";
import { setMyAgentIdentity } from "@/server/actions/admin-users";

/**
 * The accounts sellers hand a deal to when you run it, kept by you: one
 * email for YouTube, Instagram and websites, a Telegram username, and a
 * Facebook account. A Telegram seller makes a username an admin, never an
 * email (QA, CA-87042), so each platform gets its own.
 *
 * Copied onto each deal as you take it, so nobody types it per deal and a
 * seller never gets a typo. Changing it applies to the deals you take next;
 * one already running keeps the account its seller was given.
 */
export function MyDeskIdentity({
  email: storedEmail,
  telegram: storedTelegram,
  facebook: storedFacebook,
  brand: storedBrand,
  level,
}: {
  email: string | null;
  telegram: string | null;
  facebook: string | null;
  brand: string | null;
  level: DealLevel | null;
}) {
  const ids = {
    email: useId(),
    telegram: useId(),
    facebook: useId(),
    brand: useId(),
  };
  const stored = {
    email: storedEmail ?? "",
    telegram: storedTelegram ?? "",
    facebook: storedFacebook ?? "",
  };
  const [values, setValues] = useState(stored);
  const [brand, setBrand] = useState(storedBrand ?? "Channel Adda Transfers");
  const [saved, setSaved] = useState({ ...stored, brand: storedBrand ?? "" });
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    IDENTITY_FIELDS.some(
      ({ field }) => values[field].trim() !== saved[field],
    ) || brand.trim() !== saved.brand;

  return (
    <Card>
      <CardHeader
        as="h2"
        icon={ArrowLeftRightIcon}
        title="Your deal desk"
        info="The accounts sellers hand a deal to when you run it, one for each kind of platform, and the name they see. Copied onto each deal as you take it. Leave a platform blank if you do not run its deals."
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
              const result = await setMyAgentIdentity(values.email, brand, {
                telegram: values.telegram,
                facebook: values.facebook,
              });
              if (result.ok) {
                setNote(result.message);
                setSaved({
                  email: values.email.trim(),
                  telegram: values.telegram.trim(),
                  facebook: values.facebook.trim(),
                  brand: brand.trim(),
                });
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <div className="grid gap-4">
            {IDENTITY_FIELDS.map((item) => (
              <TextField
                key={item.field}
                id={ids[item.field]}
                name={`agent-${item.field}`}
                type={item.field === "email" ? "email" : "text"}
                label={item.label}
                hint={item.hint}
                value={values[item.field]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [item.field]: event.target.value,
                  }))
                }
                placeholder={item.placeholder}
                autoComplete="off"
              />
            ))}
            <TextField
              id={ids.brand}
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
