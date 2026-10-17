import type { NavGroup } from "@/components/dashboard/app-shell";
import { AppShell } from "@/components/dashboard/app-shell";
import { getQueueCounts } from "@/server/admin-listings";
import { countFlaggedThreads } from "@/server/messages";
import { requireAdminArea } from "@/server/session";
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
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const staff = await requireAdminArea();

  // Returned before the moderation counts are fetched, not after: they feed
  // badges on pages an agent cannot open, so running those queries for them
  // would be three round trips to render nothing.
  if (staff.role === "AGENT") {
    return (
      <AppShell
        staff
        groups={[
          {
            label: null,
            items: [
              {
                label: "Deals",
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

  const [counts, flagged, openTickets] = await Promise.all([
    getQueueCounts(),
    countFlaggedThreads(),
    countOpenTickets(),
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
          label: "Deals",
          href: "/admin/deals",
          icon: "transfer",
          section: true,
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
    <AppShell groups={groups} staff>
      {children}
    </AppShell>
  );
}
