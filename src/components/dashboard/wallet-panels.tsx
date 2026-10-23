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
import {
  Card,
  CardBody,
  CardHeader,
  hintClass,
  inputClass,
  labelClass,
} from "@/components/app/kit";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { PAYOUT_NETWORKS } from "@/lib/payout-address";
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

/**
 * One panel, one job, with the job named at the top of it. Why the job works
 * the way it does sits behind the (i); only a line that stops a mistake is
 * left on the card.
 */
function Panel({
  icon,
  title,
  description,
  info,
  children,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  description?: string;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        as="h2"
        icon={icon}
        title={title}
        description={description}
        info={info}
      />
      {/* A column, so the action can sit at the foot of the card and two
          panels side by side line their buttons up. */}
      <CardBody className="flex flex-1 flex-col">{children}</CardBody>
    </Card>
  );
}

/**
 * A note inside a panel: a fact to know before pressing the button. Tinted
 * only when it is a warning about money that cannot come back.
 */
function Note({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: "neutral" | "warning";
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[0.8125rem] leading-relaxed",
        tone === "warning"
          ? "border-primary/30 bg-primary-soft/70 text-fg"
          : "border-line bg-surface-2/60 text-muted",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warning" ? "text-primary-text" : "text-subtle",
        )}
      />
      <div className="min-w-0">{children}</div>
    </div>
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
        "mt-3 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-fg",
        bad
          ? "border-danger/25 bg-danger-soft/70"
          : "border-verified/25 bg-verified-soft/70",
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

/**
 * Shown on a button while the server is working, so a tap is never silent.
 *
 * Both labels share one grid cell and only one is visible, so the button is
 * as wide as the longer of the two and does not jump when it is pressed.
 */
function BusyLabel({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: ReactNode;
  busy: ReactNode;
}) {
  return (
    <span className="grid">
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
          pending && "invisible",
        )}
      >
        {idle}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
          !pending && "invisible",
        )}
      >
        <Loader2Icon aria-hidden="true" className="animate-spin" />
        {busy}
      </span>
    </span>
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
      info="Top up once and pay for deals without raising a new invoice each time. You pay in crypto; your balance is held in US dollars."
    >
      <fieldset className="flex min-w-0 flex-wrap gap-2">
        <legend className="sr-only">Common amounts</legend>
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant="secondary"
            aria-pressed={Number(amount) === preset}
            disabled={pending}
            onClick={() => setAmount(String(preset))}
            // Picked reads as a pressed key, not as a second gold button
            // beside the one that actually takes the money.
            className="tabular-nums aria-pressed:border-fg/70 aria-pressed:bg-surface-2 aria-pressed:text-fg"
          >
            ${preset.toLocaleString("en-US")}
          </Button>
        ))}
      </fieldset>

      <TextField
        id={id}
        name="amount"
        label="Amount in US dollars"
        hint="From $10 to $10,000."
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
          <BusyLabel
            pending={pending}
            idle="Add funds"
            busy="Opening the payment page…"
          />
        </Button>
        <p className="mt-2 text-xs leading-relaxed text-subtle">
          Nothing is charged until you confirm the payment on the next page.
        </p>
        <Notice message={error} bad />
      </div>
    </Panel>
  );
}

const NETWORKS = PAYOUT_NETWORKS;

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
      title="Your wallet address"
      // The check stays on the card: it is what stops the mistake the
      // warning below describes.
      description="Check it carefully against your own wallet before you save."
      info="Payouts are sent to this address and nowhere else."
    >
      <div className="max-w-2xl">
        {/* Stated before the change, not after it. Somebody who finds out
            afterwards that their money is frozen for a day has been ambushed
            by the interface. */}
        <Note tone="warning" icon={TriangleAlertIcon}>
          <p className="font-medium">Before you save</p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 marker:text-primary-text">
            <li>
              <strong className="font-semibold">
                Withdrawals pause for 24 hours
              </strong>{" "}
              after you set or change it. This keeps your money safe if someone
              gets into your account.
            </li>
            <li>
              <strong className="font-semibold">
                Money sent to a wrong address is lost.
              </strong>{" "}
              Nobody can get it back.
            </li>
          </ul>
        </Note>

        {/* Bottom-aligned, so the two fields sit on one line even though
            their hints are different lengths. */}
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_11rem] sm:items-end">
          <TextField
            id={ids.address}
            name="address"
            label="Wallet address"
            hint="Paste it. Typing it out by hand is how mistakes happen."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            // Monospaced, because this is checked character by character.
            className="min-w-0 [&_input]:font-mono"
            required
          />
          <div>
            <label htmlFor={ids.network} className={labelClass}>
              Network
            </label>
            <p id={`${ids.network}-hint`} className={hintClass}>
              Must match the address.
            </p>
            <select
              id={ids.network}
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              aria-describedby={`${ids.network}-hint`}
              className={cn(inputClass, "mt-1.5 cursor-pointer")}
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
            <BusyLabel
              pending={pending}
              idle={current ? "Update address" : "Save address"}
              busy="Saving…"
            />
          </Button>
          <Notice message={message} bad={bad} />
        </div>
      </div>
    </Panel>
  );
}

export function RequestPayout({
  availableUsd,
  hasAddress,
  minimumUsd,
}: {
  availableUsd: number;
  hasAddress: boolean;
  /** Cents. The floor finance will send, set in the admin settings. */
  minimumUsd: number;
}) {
  const router = useRouter();
  const id = useId();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [pending, startTransition] = useTransition();

  const asMoney = (cents: number) =>
    (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });

  const max = availableUsd / 100;
  const maxLabel = asMoney(availableUsd);
  // Stated up front rather than discovered by being refused: the only way
  // to learn the floor used to be to ask for less than it.
  const minLabel = asMoney(minimumUsd);
  const belowMinimum = availableUsd < minimumUsd;

  return (
    <Panel
      icon={ArrowUpRightIcon}
      title="Withdraw"
      info="Finance checks every payout, normally within one working day. The amount is held against your balance while they do, so it cannot be spent twice."
    >
      {hasAddress && belowMinimum && minimumUsd > 0 ? (
        <Note icon={LockIcon} className="mb-4">
          The smallest payout is {minLabel}. You have {maxLabel}.
        </Note>
      ) : null}

      {/* No address: say what to do and offer it, instead of a whole form
          that cannot be used. */}
      {!hasAddress ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Add your wallet address first, so we know where to send your money.
          </p>
          <Button asChild variant="secondary" size="md">
            <a href="#payout-address">Add wallet address</a>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              id={id}
              name="amount"
              label="Amount in US dollars"
              hint={
                // Below the minimum there is no range to state: "Between $20.00
                // and $0.00" read as a broken sum.
                minimumUsd > 0 && belowMinimum
                  ? `The smallest payout is ${minLabel}.`
                  : minimumUsd > 0
                    ? `Between ${minLabel} and ${maxLabel}.`
                    : `You can take out up to ${maxLabel}.`
              }
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
              <BusyLabel
                pending={pending}
                idle="Request a payout"
                busy="Sending the request…"
              />
            </Button>
            <p className="mt-2 text-xs leading-relaxed text-subtle">
              The network takes a small fee from what is sent.
            </p>
            <Notice message={message} bad={bad} />
          </div>
        </>
      )}
    </Panel>
  );
}
