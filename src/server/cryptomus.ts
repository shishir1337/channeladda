import "server-only";

import { canonicalJson, signPayload } from "@/lib/cryptomus-sign";

/**
 * The Cryptomus client.
 *
 * Only what the deal flow needs: raise an invoice, and look one up when a
 * webhook arrives that we want to confirm rather than trust. Everything about
 * signatures lives in `@/lib/cryptomus-sign`, which is pure and tested.
 *
 * Credentials come from the environment and are never defaulted. A missing key
 * makes `isConfigured()` false, and the product then falls back to a finance
 * desk recording payments by hand — which is how it already works. The one
 * thing this must never do is pretend to charge somebody.
 */
const API = "https://api.cryptomus.com/v1";

export type CryptomusConfig = {
  merchantId: string;
  paymentKey: string;
};

export function cryptomusConfig(): CryptomusConfig | null {
  const merchantId = process.env.CRYPTOMUS_MERCHANT_ID;
  const paymentKey = process.env.CRYPTOMUS_PAYMENT_KEY;
  if (!merchantId || !paymentKey) return null;
  return { merchantId, paymentKey };
}

export function isConfigured(): boolean {
  return cryptomusConfig() !== null;
}

export type InvoiceRequest = {
  /** Cents. Converted to the decimal string Cryptomus expects. */
  amountUsd: number;
  /** Our own reference, unique per invoice. Cryptomus keys on this. */
  orderId: string;
  /** Where Cryptomus posts status changes. */
  callbackUrl: string;
  /** Where the payer lands after paying, and after giving up. */
  successUrl: string;
  returnUrl: string;
};

export type Invoice = {
  uuid: string;
  /** The hosted payment page to send the buyer to. */
  url: string;
  orderId: string;
  status: string;
  /**
   * An order_id Cryptomus has seen returns the same invoice, so a "new"
   * invoice can come back already cancelled or paid.
   */
  isFinal: boolean;
  expiresAt: Date | null;
};

export class CryptomusError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
    /** The HTTP status, when the processor answered at all. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "CryptomusError";
  }
}

/** Cents to the decimal string Cryptomus wants: 1028 -> "10.28". */
export function toAmountString(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new CryptomusError(`Invalid amount in cents: ${cents}`);
  }
  return (cents / 100).toFixed(2);
}

async function call<T>(
  path: string,
  body: Record<string, unknown>,
  config: CryptomusConfig,
): Promise<T> {
  // The signature covers these exact bytes. This used to hash the canonical
  // form and send `JSON.stringify`, which are different strings — the slash
  // escaping is the whole point of the canonical form — so the comment was
  // true of the intent and false of the code. Sending the canonical bytes is
  // correct whether the processor hashes what it received or re-encodes it.
  const signedBody = canonicalJson(body);
  const sign = signPayload(body, config.paymentKey);

  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      merchant: config.merchantId,
      sign,
    },
    body: signedBody,
    // Never cached: these are charges.
    cache: "no-store",
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CryptomusError(
      `Cryptomus returned ${response.status} with a non-JSON body`,
      text.slice(0, 300),
      response.status,
    );
  }

  const payload = parsed as {
    state?: number;
    result?: T;
    message?: string;
    errors?: unknown;
  };

  // `state: 0` is success. A 200 with `state: 1` is still a failure, which is
  // why the HTTP status alone is not enough to go on.
  if (!response.ok || payload.state !== 0 || payload.result === undefined) {
    throw new CryptomusError(
      payload.message ?? `Cryptomus rejected the request (${response.status})`,
      payload.errors ?? text.slice(0, 300),
      response.status,
    );
  }

  return payload.result;
}

export async function createInvoice(request: InvoiceRequest): Promise<Invoice> {
  const config = cryptomusConfig();
  if (!config) {
    throw new CryptomusError(
      "Cryptomus is not configured. Set CRYPTOMUS_MERCHANT_ID and CRYPTOMUS_PAYMENT_KEY.",
    );
  }

  const result = await call<{
    uuid: string;
    url: string;
    order_id: string;
    status?: string;
    payment_status?: string;
    is_final?: boolean;
    expired_at?: number;
  }>(
    "/payment",
    {
      amount: toAmountString(request.amountUsd),
      currency: "USD",
      order_id: request.orderId,
      url_callback: request.callbackUrl,
      url_success: request.successUrl,
      url_return: request.returnUrl,
      // One invoice, one payment. Letting a buyer part-pay an escrow invoice
      // creates a half-funded deal nobody can act on.
      is_payment_multiple: false,
      lifetime: 3600,
    },
    config,
  );

  return {
    uuid: result.uuid,
    url: result.url,
    orderId: result.order_id,
    status: result.payment_status ?? result.status ?? "check",
    isFinal: Boolean(result.is_final),
    expiresAt: result.expired_at ? new Date(result.expired_at * 1000) : null,
  };
}

/**
 * Ask Cryptomus what it thinks the state of an invoice is.
 *
 * Used to confirm a webhook rather than act on its word alone for anything
 * that moves money. A forged webhook that somehow passed signature checking
 * still has to agree with this.
 */
export async function getInvoice(
  orderId: string,
): Promise<InvoiceState | null> {
  const found = await lookupInvoice(orderId);
  return found.kind === "found" ? found.invoice : null;
}

export type InvoiceState = {
  status: string;
  isFinal: boolean;
  paidAmountUsd: number | null;
  payerCurrency: string | null;
};

/**
 * The same question, with the two kinds of silence kept apart.
 *
 * `missing` is the processor answering that it has no such invoice.
 * `unknown` is everything else: no credentials, a timeout, an outage, a
 * rejected key. Only the first is evidence there was nothing to pay — an
 * invoice paid during an outage must not be written off because the
 * outage lasted longer than the give-up window.
 *
 * Only an HTTP 404 counts as `missing`. Checked against the live API on
 * 2026-10-17: an unknown `order_id` comes back as HTTP 404 with
 * `{"message":"Not found","state":1}`. Anything else reads as `unknown`, and
 * the invoice is retried rather than given up — the safe way to be wrong.
 */
export type InvoiceLookup =
  | { kind: "found"; invoice: InvoiceState }
  | { kind: "missing" }
  | { kind: "unknown" };

export async function lookupInvoice(orderId: string): Promise<InvoiceLookup> {
  const config = cryptomusConfig();
  if (!config) return { kind: "unknown" };

  try {
    const result = await call<{
      status?: string;
      payment_status?: string;
      is_final?: boolean;
      payment_amount_usd?: string | null;
      payer_currency?: string | null;
    }>("/payment/info", { order_id: orderId }, config);

    const paid = result.payment_amount_usd;
    return {
      kind: "found",
      invoice: {
        status: result.payment_status ?? result.status ?? "unknown",
        isFinal: Boolean(result.is_final),
        paidAmountUsd:
          paid === null || paid === undefined
            ? null
            : Math.round(Number(paid) * 100),
        payerCurrency: result.payer_currency ?? null,
      },
    };
  } catch (error) {
    if (error instanceof CryptomusError && error.status === 404) {
      return { kind: "missing" };
    }
    console.error(`[cryptomus] info ${orderId}`, error);
    return { kind: "unknown" };
  }
}

/**
 * Which statuses mean the money is really there.
 *
 * `paid_over` is included: the buyer sent more than asked, which is still
 * paid. `wrong_amount` is not — that is an underpayment, and treating it as
 * settled would start a deal the platform has not been funded for.
 */
const SETTLED = new Set(["paid", "paid_over"]);

/** Statuses after which an invoice will never be paid. */
const DEAD = new Set(["fail", "cancel", "system_fail", "refund_fail"]);

/**
 * The processor sending the payer's money back.
 *
 * Not the same thing as an invoice that was never paid, and it used to be
 * filed with them: a refund on a deal we had already applied left the hold
 * on our books, so the deal completed normally and credited the seller out
 * of money that had gone back to the buyer. Separated so a human is told.
 */
const REFUNDED = new Set(["refund_process", "refund_paid"]);

export type InvoiceOutcome =
  | "settled"
  | "pending"
  | "dead"
  | "held"
  | "refunded";

export function classifyStatus(
  status: string,
  isFinal: boolean,
): InvoiceOutcome {
  if (SETTLED.has(status)) return "settled";
  if (status === "locked") return "held"; // AML review; neither paid nor dead
  if (REFUNDED.has(status)) return "refunded";
  if (DEAD.has(status)) return "dead";
  // `is_final` on anything else means an expired invoice.
  return isFinal ? "dead" : "pending";
}
