import {
  BellIcon,
  CircleDollarSignIcon,
  FileTextIcon,
  GavelIcon,
  MessageSquareIcon,
  StarIcon,
  TagIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MarkAllRead } from "@/components/dashboard/mark-all-read";
import { PageHead, Section } from "@/components/dashboard/page-parts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { NotificationKind } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { listNotifications, unreadCount } from "@/server/notifications";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Notifications",
};

const ICONS: Record<NotificationKind, typeof BellIcon> = {
  MESSAGE: MessageSquareIcon,
  OFFER: TagIcon,
  ORDER: CircleDollarSignIcon,
  LISTING: FileTextIcon,
  PAYOUT: WalletIcon,
  DISPUTE: GavelIcon,
  REVIEW: StarIcon,
};

/** What each kind is, in the reader's terms rather than the schema's. */
const KINDS: Record<NotificationKind, string> = {
  MESSAGE: "Message",
  OFFER: "Offer",
  ORDER: "Deal",
  LISTING: "Listing",
  PAYOUT: "Payout",
  DISPUTE: "Dispute",
  REVIEW: "Review",
};

/**
 * Everything, in order.
 *
 * The bell answers "is there anything?" without leaving the page you were on.
 * This is for when the answer was yes and you want to go back through it.
 */
export default async function NotificationsPage() {
  const user = await requireUser("/dashboard/notifications");
  const [items, unread] = await Promise.all([
    listNotifications(user.id, 100),
    unreadCount(user.id),
  ]);

  return (
    <>
      <PageHead
        title="Notifications"
        description={
          unread > 0
            ? `${unread} of these have not been read yet.`
            : "Everything that has happened on your deals, listings and offers."
        }
        actions={unread > 0 ? <MarkAllRead /> : undefined}
      />

      <Section>
        {items.length === 0 ? (
          <EmptyState
            icon={BellIcon}
            title="Nothing yet"
            description="Offers on your listings, messages, and anything a deal needs from you will show up here — and by email, so you do not have to keep checking."
            action={
              <Button asChild size="md">
                <Link href="/browse">Browse accounts</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
            {items.map((item) => {
              const Icon = ICONS[item.kind] ?? BellIcon;
              const isUnread = item.readAt === null;

              const inner = (
                <>
                  <span
                    className={cn(
                      "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl",
                      isUnread
                        ? "bg-primary-soft text-primary-text"
                        : "bg-surface-2 text-subtle",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span
                        className={cn(
                          "text-sm leading-snug",
                          isUnread
                            ? "font-semibold text-fg"
                            : "font-medium text-muted",
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="text-[0.6875rem] tracking-wide text-subtle uppercase">
                        {KINDS[item.kind] ?? item.kind}
                      </span>
                      {isUnread ? (
                        <span className="text-[0.6875rem] font-semibold text-primary-text">
                          New
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">
                      {item.body}
                    </span>
                    <span className="mt-1.5 block text-xs text-subtle">
                      {item.createdAt.toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                </>
              );

              const className = cn(
                "flex gap-3.5 p-4 transition-colors sm:p-5",
                isUnread ? "bg-primary/[0.03]" : null,
                item.href ? "hover:bg-surface-2" : null,
              );

              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link href={item.href} className={className}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={className}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
