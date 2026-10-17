import type { NavGroup } from "@/components/dashboard/app-shell";
import { AppShell } from "@/components/dashboard/app-shell";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { countOpenDisputes } from "@/server/admin-disputes";
import { getQueueCounts } from "@/server/admin-listings";
import { countFlaggedThreads } from "@/server/messages";
import { listNotifications, unreadCount } from "@/server/notifications";
import { type CurrentUser, requireAdminArea } from "@/server/session";
import { countOpenTickets } from "@/server/support";

/**
 * The staff area.
 *
 * Same shell as the member dashboard, different navigation — one interface to
 * learn, and a staff mark in the rail so nobody is ever unsure which side of
 * the product they are looking at.
 *
 * The guard here decides what is drawn. It is not the security boundary: every
 * action re-checks the role itself.
 *
 * An AGENT gets in, and sees Deals and nothing else. They are not in the STAFF
 * list, so every other page here still guards with `requireStaff()` and hands
 * them the same 404 a stranger would get. The moderation counts are skipped
 * for them too — they feed badges on pages an agent cannot open.
 */
/**
 * The same bell the member area has.
 *
 * Staff are notified like anybody else — a dispute, a payout request, a
 * deal that needs an agent — and the rail badges only count queues, not
 * things addressed to this person.
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
/** Only what the account menu shows, so nothing else crosses to the client. */
function shellUser(user: CurrentUser) {
  return {
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
  };
}

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const staff = await requireAdminArea();

  // Returned before the moderation counts are fetched, not after: they feed
  // badges on pages an agent cannot open, so running those queries for them
  // would be three round trips to render nothing.
  if (staff.role === "AGENT") {
    return (
      <AppShell
        staff
        user={shellUser(staff)}
        groups={[
          {
            label: null,
            items: [
              {
                label: "Deal desk",
                // The query is what filters the page to this agent, but the
                // nav compares against the pathname, which has no query —
                // so with it here the item never highlighted and the header
                // fell back to "Your account" on every page of the staff
                // area. The filter is applied by the page from the role.
                href: "/admin/deals",
                icon: "transfer",
                section: true,
              },
            ],
          },
        ]}
      >
        {children}
      </AppShell>
    );
  }

  const [counts, flagged, openTickets, disputes] = await Promise.all([
    getQueueCounts(),
    countFlaggedThreads(),
    countOpenTickets(),
    countOpenDisputes(),
  ]);

  const groups: NavGroup[] = [
    {
      label: null,
      items: [{ label: "Overview", href: "/admin", icon: "overview" }],
    },
    {
      label: "Transfers",
      items: [
        {
          label: "Deal desk",
          href: "/admin/deals",
          icon: "transfer",
          section: true,
        },
        {
          label: "Disputes",
          href: "/admin/disputes",
          icon: "dispute",
          section: true,
          waiting: disputes,
        },
      ],
    },
    // Payouts is FINANCE and SUPERADMIN only, which is what the page's own
    // guard enforces. The nav showed it to moderators too, and the 404 it
    // leads to throws them out of the staff shell onto the public
    // marketing page — “This page has been sold, moved or never existed”.
    ...(staff.role === "FINANCE" || staff.role === "SUPERADMIN"
      ? [
          {
            label: "Money",
            items: [
              {
                label: "Money desk",
                href: "/admin/money",
                icon: "money" as const,
                section: true,
              },
              {
                label: "Payouts",
                href: "/admin/payouts",
                icon: "money" as const,
                section: true,
              },
            ],
          },
        ]
      : []),
    {
      label: "Moderation",
      items: [
        {
          label: "Listing queue",
          href: "/admin/listings",
          icon: "review",
          section: true,
          waiting: counts.awaitingReview,
        },
        {
          label: "Conversations",
          href: "/admin/messages",
          icon: "messages",
          section: true,
          waiting: flagged,
        },
        {
          label: "Support",
          href: "/admin/support",
          icon: "support",
          section: true,
          waiting: openTickets,
        },
      ],
    },
    {
      label: "Platform",
      items: [
        { label: "People", href: "/admin/users", icon: "people" as const },
        // Superadmin-only, like Payouts and Settings above: the page appoints
        // staff and hands out invitation links. Drawn only for the role that
        // can open it, because the 404 the others would get throws them out of
        // the staff shell onto the public marketing page.
        ...(staff.role === "SUPERADMIN"
          ? [
              {
                label: "Team",
                href: "/admin/team",
                icon: "staff" as const,
              },
            ]
          : []),
      ],
    },
    ...(staff.role === "SUPERADMIN"
      ? [
          {
            label: null,
            items: [
              {
                label: "Settings",
                href: "/admin/settings",
                icon: "settings" as const,
              },
            ],
          },
        ]
      : []),
  ];

  return (
    <AppShell
      groups={groups}
      staff
      user={shellUser(staff)}
      bell={await bellFor(staff.id)}
    >
      {children}
    </AppShell>
  );
}
