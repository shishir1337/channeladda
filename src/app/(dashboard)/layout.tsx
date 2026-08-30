import type { NavGroup } from "@/components/dashboard/app-shell";
import { AppShell } from "@/components/dashboard/app-shell";
import { getWaitingOnYou } from "@/server/dashboard";
import { countUnreadThreads } from "@/server/messages";
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
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  // Deliberately not `requireUser()`.
  //
  // A layout does not know which page is rendering inside it, so redirecting
  // from here would send people to /signin with no way back to where they were
  // going. Each page calls `requireUser("/its/path")` and that redirect wins,
  // so this only has to avoid rendering a signed-out shell.
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const [waiting, unread] = await Promise.all([
    getWaitingOnYou(user.id),
    countUnreadThreads(user.id),
  ]);

  const groups: NavGroup[] = [
    {
      label: null,
      items: [{ label: "Overview", href: "/dashboard", icon: "overview" }],
    },
    {
      label: "Trading",
      items: [
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

  return <AppShell groups={groups}>{children}</AppShell>;
}
