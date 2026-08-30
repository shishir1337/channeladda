import { SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { UserRole } from "@/generated/prisma/enums";
import { listUsers, ROLE_LABELS } from "@/server/admin-users";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "People",
  robots: { index: false, follow: false },
};

const FILTERS = [
  { label: "Everyone", role: undefined, status: undefined },
  { label: "Staff", role: "STAFF", status: undefined },
  { label: "Suspended", role: undefined, status: "banned" },
] as const;

function RoleTag({ role }: { role: UserRole }) {
  if (role === "USER") return null;
  return (
    <span className="rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-text">
      {ROLE_LABELS[role]}
    </span>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  await requireStaff();
  const params = await searchParams;

  const query = typeof params.q === "string" ? params.q : "";
  const role = typeof params.role === "string" ? params.role : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const page = Number(params.page) || 1;

  const { rows, total, pages } = await listUsers({
    query,
    role: role as UserRole | "STAFF" | undefined,
    status: status as "banned" | "active" | undefined,
    page,
  });

  const active = FILTERS.find((f) => f.role === role && f.status === status);

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Accounts
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        People
      </h1>
      <p className="mt-2 max-w-prose text-muted">
        Everyone with an account, members and staff alike. Suspending someone
        signs them out and pauses their listings.
      </p>

      <form method="get" className="mt-6 flex flex-wrap gap-2">
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
            defaultValue={query}
            placeholder="Name, email or seller page"
            className="h-12 w-full rounded-panel border border-line bg-surface pr-3 pl-9 text-sm text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none"
          />
        </div>
        {role ? <input type="hidden" name="role" value={role} /> : null}
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <button
          type="submit"
          className="h-12 cursor-pointer rounded-panel bg-primary px-5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const href = new URLSearchParams();
          if (query) href.set("q", query);
          if (filter.role) href.set("role", filter.role);
          if (filter.status) href.set("status", filter.status);
          const isActive = active === filter;
          return (
            <Link
              key={filter.label}
              href={`/admin/users${href.size ? `?${href}` : ""}`}
              aria-current={isActive ? "page" : undefined}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                isActive
                  ? "border-primary/40 bg-primary-soft font-medium text-primary-text"
                  : "border-line text-muted hover:text-fg"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <p className="mt-5 text-sm text-subtle">
        <span className="tnum">{total.toLocaleString("en-US")}</span>{" "}
        {total === 1 ? "account" : "accounts"}
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-panel border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          Nobody matches that.
        </p>
      ) : (
        <ul className="mt-3 grid gap-px overflow-hidden rounded-panel border border-line bg-line">
          {rows.map((row) => (
            <li key={row.id} className="bg-surface">
              <Link
                href={`/admin/users/${row.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-48 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{row.name}</span>
                    <RoleTag role={row.role} />
                    {row.banned ? (
                      <span className="rounded-full border border-danger/30 bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                        Suspended
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-subtle">
                    {row.email}
                  </span>
                </span>

                <span className="tnum flex shrink-0 gap-4 text-xs text-subtle">
                  <span>{row.listings} listed</span>
                  <span>{row.sold} sold</span>
                  <span>{row.bought} bought</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav
          aria-label="Pages"
          className="mt-6 flex items-center justify-between gap-3 text-sm"
        >
          <PageLink
            page={page - 1}
            query={query}
            role={role}
            status={status}
            disabled={page <= 1}
          >
            Previous
          </PageLink>
          <span className="tnum text-subtle">
            Page {page} of {pages}
          </span>
          <PageLink
            page={page + 1}
            query={query}
            role={role}
            status={status}
            disabled={page >= pages}
          >
            Next
          </PageLink>
        </nav>
      ) : null}
    </>
  );
}

function PageLink({
  page,
  query,
  role,
  status,
  disabled,
  children,
}: {
  page: number;
  query: string;
  role?: string;
  status?: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-subtle opacity-50">{children}</span>;
  }
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  params.set("page", String(page));
  return (
    <Link
      href={`/admin/users?${params}`}
      className="font-medium text-primary-text underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
