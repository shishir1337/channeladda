import type { NavGroup } from "@/components/dashboard/app-shell";
import { AppShell } from "@/components/dashboard/app-shell";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { getWaitingOnYou } from "@/server/dashboard";
import { countDealsAwaiting } from "@/server/deals";
import { countUnreadThreads } from "@/server/messages";
import {
  listNotifications,
  unreadCount,
} from "@/server/notifications";
import { getCurrentUser } from "@/server/session";

/**
 * The signed-in area.
 *
 * It used to borrow the marketing chrome — announcement bar, marketing nav,
 * footer — which made every dashboard page read as a website page with a
 * table on it. This is the tool instead.
 *
 * The navigation is grouped by *what you are doing*, not by object type,
 * because everyone here is both a buyer and a seller. Forcing a mode switch
 * would hide half the product from someone who is using both halves.
 */
/**
 * The bell, built once for both areas.
 *
 * Dates cross the server/client boundary as strings so the component can
 * render a relative time without the layout deciding what 'now' is.
 */
async function bellFor(userId: string) {
  const [items, unread] = await Promise.all([
    listNotifications(userId, 12),
    unreadCount(userId),
  ]);

  return (
    <NotificationBell
      unread={unread}
      items={items.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        href: n.href,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  );
}
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  // Deliberately not `requireUser()`.
  //
  // A layout does not know which page is rendering inside it, so redirecting
  // from here would send people to /signin with no way back to where they were
  // going. Each page calls `requireUser("/its/path")` and that redirect wins,
  // so this only has to avoid rendering a signed-out shell.
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const [waiting, unread, deals, bell] = await Promise.all([
    getWaitingOnYou(user.id),
    countUnreadThreads(user.id),
    countDealsAwaiting(user.id),
    bellFor(user.id),
  ]);

  const groups: NavGroup[] = [
    {
      label: null,
      items: [
        { label: "Overview", href: "/dashboard", icon: "overview" },
        {
          label: "Notifications",
          href: "/dashboard/notifications",
          icon: "bell",
        },
      ],
    },
    {
      label: "Trading",
      items: [
        {
          label: "Deals",
          href: "/dashboard/deals",
          icon: "transfer",
          section: true,
          waiting: deals,
        },
        {
          label: "Offers",
          href: "/dashboard/offers",
          icon: "offers",
          waiting: waiting.offers,
        },
        {
          label: "Messages",
          href: "/dashboard/messages",
          icon: "messages",
          section: true,
          waiting: unread,
        },
      ],
    },
    {
      label: "Account",
      items: [
        {
          label: "Security",
          href: "/dashboard/security",
          icon: "settings",
          section: true,
        },
      ],
    },
    {
      label: "Money",
      items: [
        {
          label: "Wallet",
          href: "/dashboard/wallet",
          icon: "money",
          section: true,
        },
      ],
    },
    {
      label: "Selling",
      items: [
        {
          label: "Your listings",
          href: "/dashboard/listings",
          icon: "listings",
          section: true,
          waiting: waiting.listings,
        },
        {
          label: "List an account",
          href: "/dashboard/listings/new",
          icon: "new",
        },
      ],
    },
  ];

  return (
    <AppShell groups={groups} bell={bell}>
      {children}
    </AppShell>
  );
}
