import {
  ArrowLeftRightIcon,
  BadgeCheckIcon,
  BanknoteArrowUpIcon,
  BellIcon,
  GavelIcon,
  GemIcon,
  MessageSquareIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  StarIcon,
  StoreIcon,
  TagIcon,
  WalletIcon,
} from "lucide-react";
import type { NotificationKind } from "@/generated/prisma/enums";
import { BALANCE_CORRECTION_BODY } from "@/lib/notification-text";
import { isSecurityNotice } from "@/lib/security-notices";

type Look = { label: string; icon: typeof BellIcon };

/**
 * What a notification is, in the reader's terms, and its icon — the same in
 * the bell and on the Notifications page.
 *
 * Mostly the kind. Deals get the deal icon the Deals tab uses, not the
 * dollar sign: a step to do is not money arriving. PAYOUT also carries a
 * balance correction and, for staff, a processor's refund, which are told
 * apart by their words (`@/lib/notification-text`).
 */
const LOOKS: Record<NotificationKind, Look> = {
  MESSAGE: { label: "Message", icon: MessageSquareIcon },
  OFFER: { label: "Offer", icon: TagIcon },
  ORDER: { label: "Deal", icon: ArrowLeftRightIcon },
  LISTING: { label: "Listing", icon: StoreIcon },
  PAYOUT: { label: "Payout", icon: BanknoteArrowUpIcon },
  DISPUTE: { label: "Dispute", icon: GavelIcon },
  REVIEW: { label: "Review", icon: StarIcon },
  BADGE: { label: "Reseller badge", icon: GemIcon },
  IDENTITY: { label: "Verification", icon: BadgeCheckIcon },
};

export function notificationLook(item: {
  kind: NotificationKind;
  title: string;
  body: string;
}): Look {
  // A password, email or payout address change: filed under the nearest
  // kind, read as what it is (`@/lib/security-notices`).
  if (isSecurityNotice(item.title)) {
    return { label: "Security", icon: ShieldCheckIcon };
  }
  if (item.kind === "PAYOUT") {
    if (item.body.startsWith(BALANCE_CORRECTION_BODY)) {
      return { label: "Balance", icon: WalletIcon };
    }
    if (/refunded by the processor/i.test(item.title)) {
      return { label: "Refund", icon: ReceiptIcon };
    }
  }
  return LOOKS[item.kind] ?? { label: "Notice", icon: BellIcon };
}
