import "server-only";

import { db } from "@/lib/db";
import type { DealActor } from "@/lib/deal-machine";
import { templateFor } from "@/lib/deal-templates";
import { canSendMail, sendMail } from "@/server/mailer";

/**
 * Where a notification about a deal takes somebody: its conversation, where
 * the next step can be taken and the other side asked about it. The deal
 * page is one click from there. A deal from before conversations were
 * guaranteed falls back to its page.
 */
function dealHref(order: { id: string; conversationId: string | null }) {
  return order.conversationId
    ? `/dashboard/messages/${order.conversationId}`
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
   * transfer to it: the seller on Fastest, our agent on Safest. Never put in
   * an email to anybody else.
   */
  handoverTo?: string | null;
}) {
  const greeting = input.name ? `Hi ${input.name},` : "Hi there,";
  const mode =
    input.mode === "SAFEST"
      ? "This is a Safest deal: our agent takes the channel first, the buyer then pays the seller directly, and once the seller confirms it arrived our agent makes the buyer the owner. Channel Adda takes only its fee."
      : "This is a Fastest deal: Channel Adda holds the buyer's payment until they are the channel's primary owner, then pays the seller.";

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
            `Give ownership to this account: ${input.handoverTo}`,
            "The buyer named it before paying. Use exactly this one.",
          ]
        : []),
      "",
      mode,
      "",
      "Nothing moves until you do this, so the other side is waiting.",
    ].join("\n"),
    link: input.href,
  };
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
        handoverTo: true,
        holdUntil: true,
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
          // Only to whoever will transfer to it. A Safest seller hands the
          // channel to our agent, so the buyer's account is none of theirs.
          handoverTo:
            next.actor === "agent" ||
            (next.actor === "seller" && order.mode === "FASTEST")
              ? order.handoverTo
              : null,
        }),
      });
    }
  } catch (error) {
    console.error(`[deal-notify] ${orderId}`, error);
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
  reference: string;
  listingTitle: string;
  handoverTo: string;
}): Promise<void> {
  try {
    const href = dealHref({
      id: input.orderId,
      conversationId: input.conversationId,
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
    });
  } catch (error) {
    console.error(`[deal-notify] handover ${input.orderId}`, error);
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
