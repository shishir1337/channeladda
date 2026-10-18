import { InboxIcon } from "lucide-react";
import type { Metadata } from "next";
import { TicketCard, type TicketView } from "@/components/admin/ticket-card";
import { elapsed } from "@/components/admin/vocab";
import {
  AllClear,
  EmptyState,
  FilterBar,
  FilterLink,
  List,
  MetaItem,
  PageHeader,
  Section,
} from "@/components/app/kit";
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
      <PageHeader
        title="Support"
        description="Everything sent through the contact form, including from people who cannot sign in."
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

      <Section
        id="tickets"
        className="mt-6"
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
            <EmptyState
              icon={InboxIcon}
              title="Nothing in this view"
              body="No ticket has that status right now. Try another filter above."
            />
          )
        ) : (
          <List>
            {rows.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </List>
        )}
      </Section>
    </>
  );
}
