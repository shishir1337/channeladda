import { SearchIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_VARIANT } from "@/components/admin/vocab";
import {
  EmptyState,
  FilterBar,
  FilterLink,
  inputClass,
  PageHeader,
  TableCard,
  Td,
  Th,
  Tr,
} from "@/components/app/kit";
import { Avatar } from "@/components/app/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import type { UserRole } from "@/generated/prisma/enums";
import { emailVerificationRequired } from "@/lib/email-verification";
import { cn } from "@/lib/utils";
import { listUsers, ROLE_LABELS } from "@/server/admin-users";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "People",
  robots: { index: false, follow: false },
};

/**
 * `TEAM` rather than `STAFF`: the narrower set leaves out AGENT, so filtering
 * for the people who work here hid the agents — the role the product runs on.
 * Agents get a filter of their own too, because "which of my agents is free"
 * is a question somebody asks several times a day.
 */
const FILTERS = [
  { label: "Everyone", role: undefined, status: undefined },
  { label: "With access", role: "TEAM", status: undefined },
  { label: "Agents", role: "AGENT", status: undefined },
  { label: "Suspended", role: undefined, status: "banned" },
] as const;

const DATE: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

/**
 * Members are the default, so only a staff role is worth a tag; a member's
 * cell says so in plain text rather than with a pill.
 */
function RoleTag({ role }: { role: UserRole }) {
  if (role === "USER") {
    return <span className="text-[0.8125rem] text-subtle">Member</span>;
  }
  return <Badge variant={ROLE_VARIANT[role]}>{ROLE_LABELS[role]}</Badge>;
}

/** A count cell. Zero recedes, so the accounts with history stand out. */
function Count({ value }: { value: number }) {
  return (
    <Td numeric className={value === 0 ? "text-subtle" : "text-fg"}>
      {value.toLocaleString("en-US")}
    </Td>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const staff = await requireStaff();
  const params = await searchParams;
  const confirmationOn = emailVerificationRequired();

  const query = typeof params.q === "string" ? params.q : "";
  const role = typeof params.role === "string" ? params.role : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const page = Number(params.page) || 1;

  const { rows, total, pages } = await listUsers({
    query,
    role: role as UserRole | "STAFF" | "TEAM" | undefined,
    status: status as "banned" | "active" | undefined,
    page,
  });

  const active = FILTERS.find((f) => f.role === role && f.status === status);

  const hrefFor = (next: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (role) search.set("role", role);
    if (status) search.set("status", status);
    if (next > 1) search.set("page", String(next));
    return `/admin/users${search.size ? `?${search}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="People"
        description="Everyone with an account, members and staff alike."
        actions={
          staff.role === "SUPERADMIN" ? (
            <Button asChild variant="secondary">
              <Link href="/admin/team">
                <ShieldCheckIcon aria-hidden="true" />
                The team
              </Link>
            </Button>
          ) : null
        }
      />

      <search className="block">
        <form method="get" className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            />
            <label htmlFor="q" className="sr-only">
              Search by name, email or seller page
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Name, email or seller page"
              className={cn(inputClass, "pl-9")}
            />
          </div>
          {role ? <input type="hidden" name="role" value={role} /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </search>

      <FilterBar label="Filter accounts" className="mt-4 mb-4">
        {FILTERS.map((filter) => {
          const search = new URLSearchParams();
          if (query) search.set("q", query);
          if (filter.role) search.set("role", filter.role);
          if (filter.status) search.set("status", filter.status);
          return (
            <FilterLink
              key={filter.label}
              href={`/admin/users${search.size ? `?${search}` : ""}`}
              active={active === filter}
              // Only the filter in force has been counted.
              count={active === filter ? total : undefined}
            >
              {filter.label}
            </FilterLink>
          );
        })}
      </FilterBar>

      <section id="accounts" aria-label={active?.label ?? "Accounts"}>
        {rows.length === 0 ? (
          <EmptyState
            title="Nobody matches that"
            body="Try part of an email address, or clear the filters above."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/users">Clear the search</Link>
              </Button>
            }
          />
        ) : (
          <TableCard>
            <table className="w-full min-w-[44rem] border-collapse">
              <caption className="sr-only">
                Accounts{query ? ` matching “${query}”` : ""}: role, status,
                listings, sales, purchases and when they joined.
              </caption>
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th numeric>Listed</Th>
                  <Th numeric>Sold</Th>
                  <Th numeric>Bought</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    {/* The person cell is the link, stretched over the whole
                        cell; the stripe marks a suspended account without
                        relying on the badge alone. */}
                    <Td className="relative">
                      {row.banned ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-0.5 bg-danger"
                        />
                      ) : null}
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={row.name} className="size-8 text-xs" />
                        <div className="min-w-0">
                          <Link
                            href={`/admin/users/${row.id}`}
                            className="block max-w-[16rem] truncate text-sm leading-5 font-medium text-fg underline-offset-4 after:absolute after:inset-0 hover:underline"
                          >
                            {row.name}
                          </Link>
                          <span className="block max-w-[16rem] truncate text-[0.8125rem] leading-5 text-muted">
                            {row.email}
                          </span>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <RoleTag role={row.role} />
                    </Td>
                    <Td>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {row.banned ? (
                          <Badge variant="danger">Suspended</Badge>
                        ) : null}
                        {/* Only while confirmation is asked for: with it
                            off, every email sign-up read as unverified. */}
                        {!row.emailVerified && confirmationOn ? (
                          <Badge>Email unverified</Badge>
                        ) : null}
                        {!row.banned &&
                        (row.emailVerified || !confirmationOn) ? (
                          <span className="text-[0.8125rem] text-subtle">
                            Active
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Count value={row.listings} />
                    <Count value={row.sold} />
                    <Count value={row.bought} />
                    <Td>
                      <time
                        dateTime={row.createdAt.toISOString()}
                        className="text-[0.8125rem] whitespace-nowrap text-subtle tabular-nums"
                      >
                        {row.createdAt.toLocaleDateString("en-GB", DATE)}
                      </time>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </section>

      {rows.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.8125rem] text-muted tabular-nums">
            {total.toLocaleString("en-US")}{" "}
            {total === 1 ? "account" : "accounts"}
            {pages > 1 ? ` · Page ${page} of ${pages}` : ""}
          </p>
          <Pagination
            page={page}
            pageCount={pages}
            hrefFor={hrefFor}
            className="justify-end"
          />
        </div>
      ) : (
        <Pagination
          page={page}
          pageCount={pages}
          hrefFor={hrefFor}
          className="mt-4"
        />
      )}
    </>
  );
}
