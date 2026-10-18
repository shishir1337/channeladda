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
import {
  Dot,
  EmptyState,
  IconTile,
  List,
  ListItem,
  PageHeader,
  Section,
} from "@/components/app/kit";
import { MarkAllRead } from "@/components/dashboard/mark-all-read";
import { Button } from "@/components/ui/button";
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
      <PageHeader
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
            body="Offers on your listings, messages, and anything a deal needs from you will show up here — and by email, so you do not have to keep checking."
            action={
              <Button asChild size="md">
                <Link href="/browse">Browse accounts</Link>
              </Button>
            }
          />
        ) : (
          <List>
            {items.map((item) => {
              const Icon = ICONS[item.kind] ?? BellIcon;
              const isUnread = item.readAt === null;

              return (
                <ListItem key={item.id} href={item.href ?? undefined}>
                  <div className="flex items-start gap-3">
                    <IconTile icon={Icon} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm leading-5">
                          <span
                            className={cn(
                              "text-fg",
                              isUnread ? "font-medium" : "font-normal",
                            )}
                          >
                            {item.title}
                          </span>
                          <span className="ml-2 text-xs whitespace-nowrap text-subtle">
                            {KINDS[item.kind] ?? item.kind}
                          </span>
                          {isUnread ? (
                            <span className="sr-only"> New</span>
                          ) : null}
                        </p>
                        {/* Unread is a gold dot beside the time — the one
                            mark on the row that says it still wants you. */}
                        <span className="flex shrink-0 items-center gap-2 pt-px text-xs leading-5 whitespace-nowrap text-subtle tabular-nums">
                          <time dateTime={item.createdAt.toISOString()}>
                            {item.createdAt.toLocaleString("en-GB", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                          <Dot
                            tone="primary"
                            className={cn(!isUnread && "invisible")}
                          />
                        </span>
                      </div>
                      <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
                        {item.body}
                      </p>
                    </div>
                  </div>
                </ListItem>
              );
            })}
          </List>
        )}
      </Section>
    </>
  );
}
