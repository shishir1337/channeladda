"use client";

import {
  ArrowUpRightIcon,
  CheckCircle2Icon,
  Loader2Icon,
  LockIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState, useTransition } from "react";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  requestPayout,
  savePayoutAddress,
  startTopUp,
} from "@/server/actions/wallet";

/**
 * The three things a person does with a balance: put money in, say where it
 * should go out, and ask for it out.
 *
 * Each one carries its own note about what cannot be undone, next to the
 * button that does it rather than in a paragraph at the top nobody reads.
 */

/** One panel, one job, with the job named at the top of it. */
function Panel({
  icon: Icon,
  title,
  blurb,
  children,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-panel border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary-text"
        >
          <Icon className="size-[1.15rem]" />
        </span>
        <h2 className="font-display text-lg font-bold text-fg">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{blurb}</p>
      {children}
    </section>
  );
}

/**
 * The answer after a button is pressed.
 *
 * Money makes people anxious, so a result is never a bare sentence in grey:
 * it is marked good or bad, and it is announced to a screen reader.
 */
function Notice({ message, bad }: { message: string | null; bad?: boolean }) {
  if (!message) return null;
  return (
    <p
      role={bad ? "alert" : "status"}
      className={cn(
        "mt-3 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs leading-relaxed",
        bad
          ? "border-danger/30 bg-danger-soft text-fg"
          : "border-verified/30 bg-verified-soft text-fg",
      )}
    >
      {bad ? (
        <TriangleAlertIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-danger"
        />
      ) : (
        <CheckCircle2Icon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-verified"
        />
      )}
      <span>{message}</span>
    </p>
  );
}

/** Shown on a button while the server is working, so a tap is never silent. */
function Spinner() {
  return (
    <Loader2Icon aria-hidden="true" className="size-4 shrink-0 animate-spin" />
  );
}

const PRESETS = [50, 250, 1_000];

export function TopUp() {
  const id = useId();
  const [amount, setAmount] = useState("250");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Panel
      icon={PlusIcon}
      title="Add funds"
      blurb="Top up once and pay for deals without raising a new invoice each time. You pay in crypto; your balance is held in US dollars."
    >
      <fieldset className="mt-5 flex min-w-0 flex-wrap gap-2">
        <legend className="sr-only">Common amounts</legend>
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={Number(amount) === preset ? "primary" : "secondary"}
            aria-pressed={Number(amount) === preset}
            disabled={pending}
            onClick={() => setAmount(String(preset))}
          >
            ${preset.toLocaleString("en-US")}
          </Button>
        ))}
      </fieldset>

      <TextField
        id={id}
        name="amount"
        label="Amount in US dollars"
        hint="Anything from $10 to $10,000. For more than that, talk to us first."
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mt-4 max-w-xs"
        required
      />

      <div className="mt-auto pt-5">
        <Button
          type="button"
          size="md"
          className="w-full sm:w-auto"
          disabled={pending || !amount.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await startTopUp(Number(amount));
              if (!result.ok) {
                setError(result.error);
                return;
              }
              if (result.url) window.location.href = result.url;
            });
          }}
        >
          {pending ? <Spinner /> : null}
          {pending ? "Opening the payment page…" : "Add funds"}
        </Button>
        <p className="mt-2.5 text-xs leading-relaxed text-subtle">
          Nothing is charged until you confirm the payment on the next page.
        </p>
        <Notice message={error} bad />
      </div>
    </Panel>
  );
}

const NETWORKS = ["TRON", "ETH", "BSC", "POLYGON", "BTC", "SOL"];

export function PayoutAddressForm({
  current,
}: {
  current: { address: string; network: string } | null;
}) {
  const router = useRouter();
  const ids = { address: useId(), network: useId() };
  const [address, setAddress] = useState(current?.address ?? "");
  const [network, setNetwork] = useState(current?.network ?? "TRON");
  const [message, setMessage] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [pending, startTransition] = useTransition();

  const changed =
    address.trim() !== (current?.address ?? "") || network !== current?.network;

  return (
    <Panel
      icon={LockIcon}
      title="Where your payouts go"
      blurb="Payouts are sent to this address and nowhere else. Check it against your own wallet, character by character, before you save it."
    >
      {/* Stated before the change, not after it. Somebody who finds out
          afterwards that their money is frozen for a day has been ambushed by
          the interface. */}
      <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary-soft px-3.5 py-3 text-xs leading-relaxed text-fg">
        <TriangleAlertIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-primary-text"
        />
        <span>
          Two things to know before you save this.{" "}
          <strong className="font-semibold">
            Withdrawals are held for 24 hours after you set or change it
          </strong>{" "}
          — that delay is what stops somebody who gets into your account from
          emptying it.{" "}
          <strong className="font-semibold">
            A payout sent to a wrong address is gone
          </strong>{" "}
          — not held, not reversible, and not something Channel Adda or anybody
          else can get back.
        </span>
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_11rem]">
        <TextField
          id={ids.address}
          name="address"
          label="Wallet address"
          hint="Paste it. Typing it out by hand is how mistakes happen."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
        <div>
          <label
            htmlFor={ids.network}
            className="block text-sm font-medium text-fg"
          >
            Network
          </label>
          <p className="mt-1 text-xs text-subtle">Must match the address.</p>
          <select
            id={ids.network}
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="mt-2 h-12 w-full cursor-pointer rounded-xl border border-line bg-surface-2 px-3 text-base text-fg focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
          >
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5">
        <Button
          type="button"
          size="md"
          variant={changed ? "primary" : "secondary"}
          className="w-full sm:w-auto"
          disabled={pending || !address.trim()}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await savePayoutAddress(address, network);
              setBad(!result.ok);
              setMessage(result.ok ? result.message : result.error);
              if (result.ok) router.refresh();
            });
          }}
        >
          {pending ? <Spinner /> : null}
          {pending ? "Saving…" : current ? "Update address" : "Save address"}
        </Button>
        <Notice message={message} bad={bad} />
      </div>
    </Panel>
  );
}

export function RequestPayout({
  availableUsd,
  hasAddress,
}: {
  availableUsd: number;
  hasAddress: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [pending, startTransition] = useTransition();

  const max = availableUsd / 100;
  const maxLabel = max.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

  return (
    <Panel
      icon={ArrowUpRightIcon}
      title="Withdraw"
      blurb="Finance checks every payout, normally within one working day. The amount is held against your balance while they do, so it cannot be spent twice."
    >
      {!hasAddress ? (
        <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-muted">
          <LockIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-subtle"
          />
          <span>
            Set a payout address first — the panel below. We have nowhere to
            send money to until you do, and withdrawals are held for 24 hours
            after you set it.
          </span>
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <TextField
          id={id}
          name="amount"
          label="Amount in US dollars"
          hint={`You can take out up to ${maxLabel}.`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="min-w-0 flex-1 sm:max-w-xs"
          disabled={!hasAddress || max <= 0}
          required
        />
        <Button
          type="button"
          size="md"
          variant="secondary"
          onClick={() => setAmount(String(max))}
          disabled={pending || !hasAddress || max <= 0}
        >
          All of it
        </Button>
      </div>

      <div className="mt-auto pt-5">
        <Button
          type="button"
          size="md"
          className="w-full sm:w-auto"
          disabled={pending || !hasAddress || max <= 0 || !amount.trim()}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await requestPayout(Number(amount));
              setBad(!result.ok);
              setMessage(result.ok ? result.message : result.error);
              if (result.ok) {
                setAmount("");
                router.refresh();
              }
            });
          }}
        >
          {pending ? <Spinner /> : null}
          {pending ? "Sending the request…" : "Request a payout"}
        </Button>
        <p className="mt-2.5 text-xs leading-relaxed text-subtle">
          The blockchain takes its own network fee out of the amount sent. That
          fee is set by the network, not by Channel Adda.
        </p>
        <Notice message={message} bad={bad} />
      </div>
    </Panel>
  );
}
