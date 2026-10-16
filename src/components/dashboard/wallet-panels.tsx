"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
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

function Notice({ message, bad }: { message: string | null; bad?: boolean }) {
  if (!message) return null;
  return (
    <p
      role={bad ? "alert" : "status"}
      className={`mt-2.5 text-xs leading-relaxed ${bad ? "text-danger" : "text-muted"}`}
    >
      {message}
    </p>
  );
}

const PRESETS = [50, 250, 1_000];

export function TopUp() {
  const id = useId();
  const [amount, setAmount] = useState("250");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">Add funds</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Top up once and pay for deals without raising a new invoice each time.
        Paid in crypto; your balance is held in USD.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={Number(amount) === preset ? "primary" : "secondary"}
            onClick={() => setAmount(String(preset))}
          >
            ${preset.toLocaleString("en-US")}
          </Button>
        ))}
      </div>

      <TextField
        id={id}
        name="amount"
        label="Amount (USD)"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mt-4 max-w-xs"
        required
      />

      <Button
        type="button"
        size="md"
        className="mt-4"
        disabled={pending}
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
        {pending ? "Opening…" : "Add funds"}
      </Button>
      <Notice message={error} bad />
    </section>
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

  return (
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">
        Where your payouts go
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Check this against your wallet before saving. A payout sent to the wrong
        address is gone — not held, not reversible, and not something Channel
        Adda or anybody else can retrieve.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_10rem]">
        <TextField
          id={ids.address}
          name="address"
          label="Wallet address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
        <div>
          <label
            htmlFor={ids.network}
            className="mb-1.5 block text-sm font-medium text-fg"
          >
            Network
          </label>
          <select
            id={ids.network}
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface px-3 text-sm text-fg"
          >
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button
        type="button"
        size="md"
        className="mt-4"
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
        {pending ? "Saving…" : current ? "Update address" : "Save address"}
      </Button>
      <Notice message={message} bad={bad} />
    </section>
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

  return (
    <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">Withdraw</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        {hasAddress
          ? "Finance reviews payouts within one working day. The amount is held against your balance while they do, so it cannot be spent twice."
          : "Add a payout address above before withdrawing."}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <TextField
          id={id}
          name="amount"
          label={`Amount (USD, up to ${max.toLocaleString("en-US", { style: "currency", currency: "USD" })})`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="max-w-xs"
          required
        />
        <Button
          type="button"
          size="md"
          variant="secondary"
          onClick={() => setAmount(String(max))}
          disabled={max <= 0}
        >
          All of it
        </Button>
      </div>

      <Button
        type="button"
        size="md"
        className="mt-4"
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
        {pending ? "Requesting…" : "Request a payout"}
      </Button>
      <Notice message={message} bad={bad} />
    </section>
  );
}
