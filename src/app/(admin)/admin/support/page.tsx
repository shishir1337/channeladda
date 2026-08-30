import type { Metadata } from "next";
import Link from "next/link";
import { TicketCard, type TicketView } from "@/components/admin/ticket-card";
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
  await requireStaff();
  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : "OPEN";
  const status =
    raw === "OPEN" || raw === "ANSWERED" || raw === "CLOSED" ? raw : undefined;

  const tickets = await listTickets(status);
  const rows: TicketView[] = tickets.map((ticket) => ({
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
  }));

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Inbox
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        Support
      </h1>
      <p className="mt-2 max-w-prose text-muted">
        Everything sent through the contact form. People who cannot sign in end
        up here too, so this is where a locked-out seller gets found.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const active = (status ?? "") === tab.value;
          return (
            <Link
              key={tab.label}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                active
                  ? "border-primary/40 bg-primary-soft font-medium text-primary-text"
                  : "border-line text-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-panel border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          Nothing here.
        </p>
      ) : (
        <ul className="mt-6 grid gap-px overflow-hidden rounded-panel border border-line bg-line">
          {rows.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </ul>
      )}
    </>
  );
}
