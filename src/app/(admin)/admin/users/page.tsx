import { SearchIcon, ShieldCheckIcon, UserRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ConsoleHeader,
  ConsoleSection,
  FilterBar,
  FilterLink,
  MetaItem,
  Nothing,
  RowItem,
  Rows,
} from "@/components/admin/console";
import { ROLE_VARIANT } from "@/components/admin/vocab";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import type { UserRole } from "@/generated/prisma/enums";
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

/** Members are the default, so only a staff role is worth a tag. */
function RoleTag({ role }: { role: UserRole }) {
  if (role === "USER") return null;
  return <Badge variant={ROLE_VARIANT[role]}>{ROLE_LABELS[role]}</Badge>;
}

export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const staff = await requireStaff();
  const params = await searchParams;

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
      <ConsoleHeader
        eyebrow="Accounts"
        title="People"
        description="Everyone with an account, members and staff alike. Suspending someone signs them out and pauses their listings; only a superadmin can change what someone can reach."
        actions={
          staff.role === "SUPERADMIN" ? (
            <Link
              href="/admin/team"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              <ShieldCheckIcon aria-hidden="true" className="size-4" />
              The team
            </Link>
          ) : null
        }
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            <MetaItem label="Matching">
              {total.toLocaleString("en-US")}{" "}
              {total === 1 ? "account" : "accounts"}
            </MetaItem>
            {query ? <MetaItem label="Search">{query}</MetaItem> : null}
          </>
        }
      />

      <search className="mt-5 block">
        <form method="get" className="flex flex-wrap items-stretch gap-2">
          <div className="relative min-w-56 flex-1">
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
              className="h-12 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-sm"
            />
          </div>
          {role ? <input type="hidden" name="role" value={role} /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <button
            type="submit"
            className="h-12 shrink-0 cursor-pointer rounded-xl bg-primary px-5 text-sm font-medium text-primary-fg shadow-soft transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </form>
      </search>

      <div className="mt-3">
        <FilterBar label="Filter accounts">
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
              >
                {filter.label}
              </FilterLink>
            );
          })}
        </FilterBar>
      </div>

      <ConsoleSection
        id="accounts"
        title={active?.label ?? "Accounts"}
        count={total}
        description={
          pages > 1
            ? `Page ${page} of ${pages}. Open an account to see its history and the controls.`
            : "Open an account to see its history and the controls."
        }
      >
        {rows.length === 0 ? (
          <Nothing
            title="Nobody matches that"
            body="Try part of an email address, or clear the filters above."
            action={
              <Link
                href="/admin/users"
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                Clear the search
              </Link>
            }
          />
        ) : (
          <Rows>
            {rows.map((row) => (
              <RowItem key={row.id} flag={row.banned ? "danger" : undefined}>
                <Link
                  href={`/admin/users/${row.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 pl-5 transition-colors hover:bg-surface-2"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-subtle">
                    {row.role === "USER" ? (
                      <UserRoundIcon aria-hidden="true" className="size-4" />
                    ) : (
                      <ShieldCheckIcon aria-hidden="true" className="size-4" />
                    )}
                  </span>
                  <span className="min-w-40 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-fg">
                        {row.name}
                      </span>
                      <RoleTag role={row.role} />
                      {row.banned ? (
                        <Badge variant="danger">Suspended</Badge>
                      ) : null}
                      {!row.emailVerified ? (
                        <Badge>Email unverified</Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-subtle">
                      {row.email}
                    </span>
                  </span>

                  <span className="flex shrink-0 gap-4 text-right">
                    {[
                      { label: "listed", value: row.listings },
                      { label: "sold", value: row.sold },
                      { label: "bought", value: row.bought },
                    ].map((stat) => (
                      <span key={stat.label} className="block">
                        <span className="tnum block text-sm font-semibold text-fg">
                          {stat.value.toLocaleString("en-US")}
                        </span>
                        <span className="block text-[0.625rem] tracking-wide text-subtle uppercase">
                          {stat.label}
                        </span>
                      </span>
                    ))}
                  </span>
                </Link>
              </RowItem>
            ))}
          </Rows>
        )}
      </ConsoleSection>

      <Pagination
        page={page}
        pageCount={pages}
        hrefFor={hrefFor}
        className="mt-7"
      />
    </>
  );
}
