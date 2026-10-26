import { BellIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InfoTip } from "@/components/app/info-tip";
import {
  Dot,
  EmptyState,
  IconTile,
  List,
  ListItem,
  PageHeader,
  Section,
} from "@/components/app/kit";
import { SoundToggle } from "@/components/app/notification-sound";
import { MarkAllRead } from "@/components/dashboard/mark-all-read";
import { NotificationLink } from "@/components/dashboard/notification-link";
import { notificationLook } from "@/components/dashboard/notification-look";
import { Button } from "@/components/ui/button";
import { dayAndTime, type ViewerZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  listNotifications,
  type NotificationView,
  unreadCount,
} from "@/server/notifications";
import { requireUser } from "@/server/session";
import { viewerZone } from "@/server/viewer-zone";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

/**
 * Everything, in order.
 *
 * The bell answers "is there anything?" without leaving the page you were on.
 * This is for when the answer was yes and you want to go back through it.
 */
export default async function NotificationsPage() {
  const user = await requireUser("/dashboard/notifications");
  const [items, unread, zone] = await Promise.all([
    listNotifications(user.id, 100),
    unreadCount(user.id),
    viewerZone(),
  ]);

  return (
    <>
      {/* The one line is the unread count, and only while there is one;
          what the page is for waits behind the (i). */}
      <PageHeader
        title="Notifications"
        description={
          unread > 0 ? `${unread} of these have not been read yet.` : undefined
        }
        info="Everything that has happened on your deals, listings and offers."
        actions={
          <>
            {/* Per browser: a chime when something new arrives, even in
                another tab. */}
            <SoundToggle variant="button" />
            {unread > 0 ? <MarkAllRead /> : null}
          </>
        }
      />

      <Section>
        {items.length === 0 ? (
          <EmptyState
            icon={BellIcon}
            title={
              <>
                Nothing yet
                <InfoTip label="What shows up here" className="ml-1.5">
                  Offers on your listings, messages, and anything a deal needs
                  from you will show up here — and by email, so you do not have
                  to keep checking.
                </InfoTip>
              </>
            }
            action={
              <Button asChild size="md">
                <Link href="/browse">Browse accounts</Link>
              </Button>
            }
          />
        ) : (
          <List>
            {items.map((item) => {
              const isUnread = item.readAt === null;
              return item.href ? (
                <ListItem key={item.id} padded={false}>
                  <NotificationLink
                    id={item.id}
                    href={item.href}
                    unread={isUnread}
                    className="group block px-3.5 py-3 transition-colors duration-150 hover:bg-surface-2/60 focus-visible:-outline-offset-2 sm:px-5"
                  >
                    <Row item={item} zone={zone} />
                  </NotificationLink>
                </ListItem>
              ) : (
                <ListItem key={item.id}>
                  <Row item={item} zone={zone} />
                </ListItem>
              );
            })}
          </List>
        )}
      </Section>
    </>
  );
}

/** One notification: what it is, when, and what it says. */
function Row({ item, zone }: { item: NotificationView; zone: ViewerZone }) {
  const look = notificationLook(item);
  const isUnread = item.readAt === null;
  return (
    <div className="flex items-start gap-3">
      <IconTile icon={look.icon} />
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
              {look.label}
            </span>
            {isUnread ? <span className="sr-only"> New</span> : null}
          </p>
          {/* Unread is a gold dot beside the time — the one
                mark on the row that says it still wants you. */}
          <span className="flex shrink-0 items-center gap-2 pt-px text-xs leading-5 whitespace-nowrap text-subtle tabular-nums">
            <time dateTime={item.createdAt.toISOString()}>
              {dayAndTime(item.createdAt, zone)}
            </time>
            <Dot tone="primary" className={cn(!isUnread && "invisible")} />
          </span>
        </div>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
          {item.body}
        </p>
      </div>
    </div>
  );
}
