import type { NavGroup } from "@/components/dashboard/app-shell";
import { AppShell } from "@/components/dashboard/app-shell";
import { getQueueCounts } from "@/server/admin-listings";
import { countFlaggedThreads } from "@/server/messages";
import { requireStaff } from "@/server/session";
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
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const staff = await requireStaff();
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
