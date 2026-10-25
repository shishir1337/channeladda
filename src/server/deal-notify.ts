import "server-only";

import type { DealMode } from "@/generated/prisma/enums";
import { CUSTODIAN_ROLES, withinLevel } from "@/lib/custody-roles";
import { db } from "@/lib/db";
import type { DealActor } from "@/lib/deal-machine";
import { awaitsAgent, templateFor } from "@/lib/deal-templates";
import { threadHref } from "@/lib/thread-href";
import { canSendMail, sendMail } from "@/server/mailer";
import { notify } from "@/server/notifications";

/**
 * Where a notification about a deal takes somebody: its conversation, where
 * the next step can be taken and the other side asked about it. The deal
 * page is one click from there. Opened on the deal's listing, since a
 * conversation can be about several. A deal from before conversations were
 * guaranteed falls back to its page.
 */
function dealHref(order: {
  id: string;
  conversationId: string | null;
  listingId: string;
}) {
  return order.conversationId
    ? threadHref(order.conversationId, order.listingId)
    : `/dashboard/deals/${order.id}`;
}

/** Where a link in an email has to point. */
function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  );
}

/**
 * The email that reaches somebody who is not looking at the dashboard.
 *
 * Separate and pure so the words can be tested without a mail server. The
 * subject names the thing being asked for, because “Update on your deal” is
 * what everybody's filters learn to ignore — and the one thing this email
 * exists to survive is a week of not logging in.
 */
export function turnEmail(input: {
  name: string | null;
  reference: string;
  listingTitle: string;
  stepLabel: string;
  mode: "SAFEST" | "FASTEST";
  href: string;
  /**
   * The buyer's account that receives ownership, for the person who will
   * transfer to it: our agent, in both modes. Never put in an email to
   * anybody else.
   */
  handoverTo?: string | null;
  /** What this step does with it (`handoverAction`). */
  handoverAction?: string | null;
}) {
  const greeting = input.name ? `Hi ${input.name},` : "Hi there,";
  const mode =
    input.mode === "SAFEST"
      ? "This is a Safest deal: our agent takes the channel first and verifies it, the buyer then pays the seller directly, and once the seller confirms it arrived our agent transfers it to the buyer. Channel Adda takes only its fee."
      : "This is a Fastest deal: Channel Adda holds the buyer's payment while our agent takes the channel from the seller. Once our agent is primary owner the seller is paid, and our agent makes the buyer primary owner.";

  return {
    subject: `Your move: ${input.stepLabel} (${input.reference})`,
    body: [
      greeting,
      "",
      `It is your turn on ${input.listingTitle} (${input.reference}).`,
      "",
      `What is needed: ${input.stepLabel}`,
      ...(input.handoverTo
        ? [
            "",
            `${input.handoverAction ?? "Give ownership to this account"}: ${input.handoverTo}`,
            "The buyer named it before paying. Use exactly this one.",
          ]
        : []),
      "",
      mode,
      "",
      "Nothing moves until you do this, so the other side is waiting.",
    ].join("\n"),
    link: input.href,
    action: "Open the deal",
  };
}

/**
 * What a step does with the buyer's account, for the email that names it,
 * or null for a step that does not touch it — which is then not sent it.
 *
 * "Give ownership to this account" on the step that only adds a manager
 * invited a Fastest seller to hand the channel over before the holding
 * period; on a platform with no wait of its own nothing would stop them.
 */
export function handoverAction(
  mode: DealMode,
  position: number,
): string | null {
  const step = templateFor(mode).find((s) => s.position === position);
  if (!step || !(step.usesHandover || step.handsOver)) return null;
  if (!step.handsOver) return "Invite this account as an owner";
  return "Make this account the primary owner";
}

/**
 * Telling the next person it is their turn.
 *
 * A deal is up to nine steps with a multi-day wait in the middle. Without this
 * the counterparty finds out it is their move only by happening to open the
 * dashboard, which for a seller waiting on a Google transfer could be days.
 *
 * Best effort, deliberately: a deal step must never fail because a
 * notification could not be written. The step is the thing that matters and
 * it has already happened by the time this runs.
 */
export async function notifyNextActor(orderId: string): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        reference: true,
        mode: true,
        status: true,
        buyerId: true,
        sellerId: true,
        agentId: true,
        conversationId: true,
        listingId: true,
        handoverTo: true,
        holdUntil: true,
        priceUsd: true,
        listing: { select: { title: true } },
        steps: {
          where: { completedAt: null },
          orderBy: { position: "asc" },
          take: 1,
          select: { position: true, label: true, actor: true },
        },
      },
    });

    if (!order) return;

    // While the deal's hold runs the next step exists but cannot be taken,
    // so "your move" would be a lie. The sweep that sees the hold end
    // (`announceEndedHolds`) calls this again, and then it is true.
    if (order.holdUntil && order.holdUntil > new Date()) return;

    const next = order.steps[0];
    if (!next) return;

    // The seller's next move is to invite our agent, and there is no agent
    // yet: telling them it is their move sent them looking for an address
    // that was not there. Whoever can take the deal is asked instead, and
    // the seller hears when the agent joins (`assignAgent` calls this again).
    if (awaitsAgent(order.mode as DealMode, next.position, order.agentId)) {
      await askForAgent(order);
      return;
    }

    const recipients: Partial<Record<DealActor, string | null>> = {
      buyer: order.buyerId,
      seller: order.sellerId,
      agent: order.agentId,
    };
    const userId = recipients[next.actor as DealActor];
    if (!userId) return;

    const href = dealHref(order);
    await db.notification.create({
      data: {
        userId,
        kind: "ORDER",
        title: `${next.label} — ${order.reference}`,
        body: `Your move on ${order.listing.title}.`,
        href,
      },
    });

    // And by email, because the notification row is the part that only
    // reaches somebody already looking. A deal has a multi-day wait in it;
    // a week of silence is the normal case this has to survive.
    //
    // Skipped entirely with no mail path configured: there is nothing to
    // send, and looking up an address to log a message nobody will read is
    // a round trip on every step of every deal.
    if (!canSendMail()) return;

    const person = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    // Only to whoever will transfer to it, and only on a step that uses it.
    // Sellers hand the channel to our agent in both modes, so the buyer's
    // account is none of theirs.
    const action = handoverAction(order.mode as DealMode, next.position);
    if (person?.email) {
      await sendMail({
        to: person.email,
        ...turnEmail({
          name: person.name,
          reference: order.reference,
          listingTitle: order.listing.title,
          stepLabel: next.label,
          mode: order.mode as "SAFEST" | "FASTEST",
          href: `${siteUrl()}${href}`,
          handoverTo: action ? order.handoverTo : null,
          handoverAction: action,
        }),
      });
    }
  } catch (error) {
    console.error(`[deal-notify] ${orderId}`, error);
  }
}

/**
 * A paid deal that nobody is running yet, put in front of everyone who could
 * run it: the agents and moderators whose level covers its price, and the
 * superadmin. By email too — the buyer has paid and the seller is waiting.
 */
async function askForAgent(order: {
  id: string;
  reference: string;
  priceUsd: number;
  listing: { title: string };
}): Promise<void> {
  const people = await db.user.findMany({
    where: { role: { in: [...CUSTODIAN_ROLES] }, bannedAt: null },
    select: { id: true, role: true, dealLevel: true },
  });
  const title = `${order.reference} needs an agent`;
  const body = `${order.listing.title} is paid and waiting. Take it on the deal desk so the seller can invite you.`;
  for (const person of people) {
    if (!withinLevel(person.dealLevel, person.role, order.priceUsd)) continue;
    await notify({
      userId: person.id,
      kind: "ORDER",
      title,
      body,
      href: "/admin/deals",
      email: { subject: title, body },
    });
  }
}

/**
 * The buyer corrected the account that receives ownership. Told to whoever
 * transfers to it, by notification and by email, at once: they may have an
 * invite to the old address ready to send. Best effort, as above.
 */
export async function notifyHandoverChanged(input: {
  userId: string;
  orderId: string;
  conversationId: string | null;
  listingId: string;
  reference: string;
  listingTitle: string;
  handoverTo: string;
}): Promise<void> {
  try {
    const href = dealHref({
      id: input.orderId,
      conversationId: input.conversationId,
      listingId: input.listingId,
    });
    // The address itself stays out of the notification row: those are
    // listed and previewed, and it belongs only on the deal and in email.
    await db.notification.create({
      data: {
        userId: input.userId,
        kind: "ORDER",
        title: `The buyer changed their account — ${input.reference}`,
        body: `Check it on the deal before transferring ${input.listingTitle}.`,
        href,
      },
    });
    if (!canSendMail()) return;
    const person = await db.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true },
    });
    if (!person?.email) return;
    await sendMail({
      to: person.email,
      subject: `The buyer changed the account to make owner (${input.reference})`,
      body: [
        person.name ? `Hi ${person.name},` : "Hi there,",
        "",
        `The buyer on ${input.listingTitle} (${input.reference}) corrected the account that receives ownership.`,
        "",
        `Give ownership to this account: ${input.handoverTo}`,
        "",
        "If you already invited the old one, remove that invite first.",
      ].join("\n"),
      link: `${siteUrl()}${href}`,
      action: "Open the deal",
    });
  } catch (error) {
    console.error(`[deal-notify] handover ${input.orderId}`, error);
  }
}

/**
 * The buyer, when the wait before the step that makes them primary owner
 * ends — Safest's second Google wait. That step is our agent's, so
 * `notifyNextActor` tells only them, and the buyer, who has been counting
 * the days, would hear nothing until it was done. Best effort.
 */
export async function notifyBuyerWaitOver(orderId: string): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        reference: true,
        mode: true,
        buyerId: true,
        conversationId: true,
        listingId: true,
        steps: {
          where: { completedAt: null },
          orderBy: { position: "asc" },
          take: 1,
          select: { position: true },
        },
      },
    });
    const next = order?.steps[0];
    if (!order || !next) return;
    const step = templateFor(order.mode as DealMode).find(
      (s) => s.position === next.position,
    );
    if (!step?.handsOver || step.actor === "buyer") return;

    const title = `You become primary owner next — ${order.reference}`;
    const body =
      "The wait is over. Our agent makes your account primary owner now. Accept their owner invite first, if you have not yet.";
    await notify({
      userId: order.buyerId,
      kind: "ORDER",
      title,
      body,
      href: dealHref(order),
      email: { subject: title, body },
    });
  } catch (error) {
    console.error(`[deal-notify] wait over ${orderId}`, error);
  }
}

/** Both sides, when a deal ends some way other than by completing. */
export async function notifyDealEnded(
  orderId: string,
  outcome: string,
): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        reference: true,
        buyerId: true,
        sellerId: true,
        agentId: true,
        conversationId: true,
        listingId: true,
        listing: { select: { title: true } },
      },
    });
    if (!order) return;

    const ids = [order.buyerId, order.sellerId, order.agentId].filter(
      (id): id is string => Boolean(id),
    );

    await db.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        kind: "ORDER" as const,
        title: `${outcome} — ${order.reference}`,
        body: `The deal for ${order.listing.title} has closed.`,
        // The agent's access to the conversation ends with the deal, so a
        // link there would be a 404 for them; the deal page is theirs.
        href:
          userId === order.agentId
            ? `/dashboard/deals/${order.id}`
            : dealHref(order),
      })),
    });
  } catch (error) {
    console.error(`[deal-notify] ended ${orderId}`, error);
  }
}

/** How many steps of this deal are still to come, for a progress line. */
export function stepsRemaining(
  mode: "SAFEST" | "FASTEST",
  nextPosition: number | null,
): number {
  const total = templateFor(mode).length;
  return nextPosition === null ? 0 : total - nextPosition + 1;
}
