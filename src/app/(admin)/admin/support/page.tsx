import type { Metadata } from "next";
import {
  AllClear,
  ConsoleHeader,
  ConsoleSection,
  FilterBar,
  FilterLink,
  MetaItem,
  Nothing,
} from "@/components/admin/console";
import { TicketCard, type TicketView } from "@/components/admin/ticket-card";
import { elapsed } from "@/components/admin/vocab";
import { requireStaff } from "@/server/session";
import { listTickets } from "@/server/support";

export const metadata: Metadata = {
  title: "Support",
  robots: { index: false, follow: false },
};

const TABS = [
  { label: "Open", value: "OPEN", href: "/admin/support?status=OPEN" },
  {
    label: "Answered",
    value: "ANSWERED",
    href: "/admin/support?status=ANSWERED",
  },
  { label: "Closed", value: "CLOSED", href: "/admin/support?status=CLOSED" },
  { label: "Everything", value: "", href: "/admin/support?status=all" },
] as const;

export default async function AdminSupportPage({
  searchParams,
}: PageProps<"/admin/support">) {
  const staff = await requireStaff();
  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : "OPEN";
  const status =
    raw === "OPEN" || raw === "ANSWERED" || raw === "CLOSED" ? raw : undefined;

  const tickets = await listTickets(status);
  const rows: TicketView[] = tickets.map((ticket) => ({
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
  }));

  // `listTickets` returns newest first, so the last row is the oldest.
  const oldest = rows.at(-1)?.createdAt;
  const showing = TABS.find((tab) => (status ?? "") === tab.value);

  return (
    <>
      <ConsoleHeader
        eyebrow="Inbox"
        title="Support"
        description="Everything sent through the contact form. People who cannot sign in end up here too, so this is where a locked-out seller gets found."
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            <MetaItem label="Showing">
              {rows.length.toLocaleString("en-US")}{" "}
              {rows.length === 1 ? "ticket" : "tickets"}
            </MetaItem>
            {oldest && status === "OPEN" ? (
              <MetaItem label="Oldest open">
                {elapsed(new Date(oldest)).label}
              </MetaItem>
            ) : null}
          </>
        }
      />

      <div className="mt-5">
        <FilterBar label="Filter by status">
          {TABS.map((tab) => (
            <FilterLink
              key={tab.label}
              href={tab.href}
              active={(status ?? "") === tab.value}
            >
              {tab.label}
            </FilterLink>
          ))}
        </FilterBar>
      </div>

      <ConsoleSection
        id="tickets"
        title={showing?.label ?? "Tickets"}
        count={rows.length}
        tone={status === "OPEN" && rows.length > 0 ? "primary" : "neutral"}
        description="A note is saved when you move a ticket, so whoever picks it up next can see what was already tried."
      >
        {rows.length === 0 ? (
          status === "OPEN" ? (
            <AllClear
              title="Nothing open"
              body="Every support request has been answered or closed. New ones arrive from the contact form."
            />
          ) : (
            <Nothing
              title="Nothing in this view"
              body="No ticket has that status right now. Try another filter above."
            />
          )
        ) : (
          <ul className="grid gap-px overflow-hidden rounded-card border border-line bg-line">
            {rows.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        )}
      </ConsoleSection>
    </>
  );
}
