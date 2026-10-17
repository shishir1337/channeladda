"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import {
  assignDealAgent,
  claimDeal,
  endDeal,
  markOpeningPaymentReceived,
} from "@/server/actions/deals";

/**
 * The staff controls on a deal row.
 *
 * Kept deliberately plain. These are the levers that move somebody else's
 * money and somebody else's channel, so each one says what it does and
 * nothing is a single unlabelled icon.
 */

function Outcome({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="mt-2 text-xs text-muted">
      {message}
    </p>
  );
}

/** An agent taking the next unheld deal. */
export function ClaimDeal({
  orderId,
  defaultEmail,
  defaultBrand,
}: {
  orderId: string;
  defaultEmail: string;
  defaultBrand: string;
}) {
  const router = useRouter();
  const ids = { email: useId(), brand: useId() };
  const [email, setEmail] = useState(defaultEmail);
  const [brand, setBrand] = useState(defaultBrand);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <TextField
        id={ids.email}
        name="agentEmail"
        label="Google account to invite"
        hint="The seller invites this as channel owner."
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <TextField
        id={ids.brand}
        name="agentBrand"
        label="Shown to the seller as"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        required
      />
      <Button
        type="button"
        size="md"
        disabled={pending || !email.trim() || !brand.trim()}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await claimDeal(orderId, email.trim(), brand.trim());
            setMessage(result.ok ? result.message : result.error);
            if (result.ok) router.refresh();
          });
        }}
      >
        {pending ? "Claiming…" : "Take this deal"}
      </Button>
      <div className="sm:col-span-3">
        <Outcome message={message} />
      </div>
    </div>
  );
}

/**
 * Recording the opening payment by hand.
 *
 * Stands in for the Cryptomus webhook. Every later step of a deal unlocks
 * behind this, so it is the one control on this page that staff will use on
 * every single deal until payments are wired.
 */
export function RecordPayment({ orderId }: { orderId: string }) {
  const router = useRouter();
  const ids = { ref: useId(), asset: useId() };
  const [ref, setRef] = useState("");
  const [asset, setAsset] = useState("USDT");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
      <TextField
        id={ids.ref}
        name="paymentRef"
        label="Payment reference"
        hint="From the processor. Recording it twice is harmless."
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        required
      />
      <TextField
        id={ids.asset}
        name="paymentAsset"
        label="Asset"
        value={asset}
        onChange={(e) => setAsset(e.target.value)}
        required
      />
      <Button
        type="button"
        size="md"
        disabled={pending || !ref.trim()}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await markOpeningPaymentReceived(
              orderId,
              ref.trim(),
              asset.trim(),
            );
            setMessage(result.ok ? result.message : result.error);
            if (result.ok) router.refresh();
          });
        }}
      >
        {pending ? "Recording…" : "Payment received"}
      </Button>
      <div className="sm:col-span-3">
        <Outcome message={message} />
      </div>
    </div>
  );
}

/**
 * Staff moving a deal to a different agent.
 *
 * The queue's claim button only covers deals nobody holds. This is the other
 * case: an agent who has been suspended, or has gone quiet, still owns the
 * channel, and somebody has to be able to take it on.
 */
export function AssignAgent({ orderId }: { orderId: string }) {
  const router = useRouter();
  const ids = { agent: useId(), email: useId(), brand: useId() };
  const [agentId, setAgentId] = useState("");
  const [email, setEmail] = useState("");
  const [brand, setBrand] = useState("Channel Adda Transfers");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
      <TextField
        id={ids.agent}
        name="agentId"
        label="New agent (user id)"
        value={agentId}
        onChange={(e) => setAgentId(e.target.value)}
        required
      />
      <TextField
        id={ids.email}
        name="agentEmail"
        label="Google account to invite"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <TextField
        id={ids.brand}
        name="agentBrand"
        label="Shown to the seller as"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        required
      />
      <div className="sm:col-span-3">
        <Button
          type="button"
          size="sm"
          disabled={pending || !agentId.trim() || !email.trim()}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await assignDealAgent(
                orderId,
                agentId.trim(),
                email.trim(),
                brand.trim(),
              );
              setMessage(result.ok ? result.message : result.error);
              if (result.ok) router.refresh();
            });
          }}
        >
          {pending ? "Assigning…" : "Reassign this deal"}
        </Button>
        <Outcome message={message} />
      </div>
    </div>
  );
}

const ENDINGS = [
  // Pausing comes first because it is the way into the other three on a
  // deal that is still running: finishing one is the last step's job, and
  // resolveDeal only decides a deal that is actually in dispute.
  { to: "DISPUTED", label: "Pause it for review" },
  { to: "RETURNED_TO_SELLER", label: "Return the channel to the seller" },
  { to: "REFUNDED", label: "Refund the buyer" },
  { to: "CANCELLED", label: "Cancel the deal" },
  { to: "COMPLETED", label: "Decide it in the seller’s favour" },
] as const;

/**
 * Ending a deal some other way.
 *
 * Which endings are actually legal from here is decided by the transition
 * table, not by this list, so an illegal one comes back as a refusal rather
 * than being hidden — staff get told why instead of wondering where a button
 * went. A note is required because it is what the audit trail will carry.
 */
export function EndDeal({ orderId }: { orderId: string }) {
  const router = useRouter();
  const ids = { note: useId() };
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3">
      <TextField
        id={ids.note}
        name="note"
        label="Why (goes in the audit trail)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="max-w-md"
        required
      />
      <div className="mt-3 flex flex-wrap gap-2.5">
        {ENDINGS.map((ending) => (
          <Button
            key={ending.to}
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending || note.trim() === ""}
            onClick={() => {
              setMessage(null);
              startTransition(async () => {
                const result = await endDeal(orderId, ending.to, note.trim());
                setMessage(result.ok ? result.message : result.error);
                if (result.ok) router.refresh();
              });
            }}
          >
            {ending.label}
          </Button>
        ))}
      </div>
      <Outcome message={message} />
    </div>
  );
}
