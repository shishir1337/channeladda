import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Panel } from "@/components/admin/console";
import { UserControls } from "@/components/admin/user-controls";
import { ROLE_VARIANT } from "@/components/admin/vocab";
import { Badge } from "@/components/ui/badge";
import { getUserDetail, ROLE_BLURBS, ROLE_LABELS } from "@/server/admin-users";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "danger" | "verified";
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <dt className="font-mono text-[0.625rem] font-semibold tracking-[0.1em] text-subtle uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1.5 text-sm font-semibold tabular-nums ${
          tone === "danger"
            ? "text-danger"
            : tone === "verified"
              ? "text-verified"
              : "text-fg"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default async function AdminUserPage({
  params,
}: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const staff = await requireStaff();
  const person = await getUserDetail(id);
  if (!person) notFound();

  return (
    <>
      <Link
        href="/admin/users"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        All people
      </Link>

      <header className="mt-2 border-b border-line pb-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-[1.6rem] leading-[1.1] font-black tracking-tight text-fg sm:text-[1.9rem]">
            {person.name}
          </h1>
          <Badge variant={ROLE_VARIANT[person.role]} size="md">
            {ROLE_LABELS[person.role]}
          </Badge>
          {person.banned ? (
            <Badge variant="danger" size="md">
              Suspended
            </Badge>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm break-all text-muted">{person.email}</p>
      </header>

      {person.banned ? (
        <Panel tone="danger" className="mt-5">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-fg">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-danger"
            />
            <span>
              <strong className="font-semibold">
                This account is suspended.
              </strong>{" "}
              They cannot sign in and their listings are paused.
              {person.banReason ? ` Reason given: ${person.banReason}` : ""}
            </span>
          </p>
        </Panel>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="min-w-0">
          <h2 className="font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-subtle uppercase">
            Account record
          </h2>
          <dl className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Fact label="Listed" value={person.listings} />
            <Fact label="Sold" value={person.sold} />
            <Fact label="Bought" value={person.bought} />
            <Fact label="Conversations open" value={person.openThreads} />
            <Fact
              label="Threads flagged"
              value={person.flaggedThreads}
              tone={person.flaggedThreads > 0 ? "danger" : undefined}
            />
            <Fact label="Active sessions" value={person.sessions} />
            <Fact
              label="Email"
              value={person.emailVerified ? "Verified" : "Unverified"}
              tone={person.emailVerified ? "verified" : "danger"}
            />
            <Fact
              label="Identity"
              value={person.kycStatus.toLowerCase().replace(/_/g, " ")}
              tone={
                person.kycStatus === "APPROVED"
                  ? "verified"
                  : person.kycStatus === "REJECTED"
                    ? "danger"
                    : undefined
              }
            />
            <Fact
              label="Joined"
              value={person.createdAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            />
          </dl>

          {person.slug ? (
            <Link
              href={`/seller/${person.slug}`}
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-text underline-offset-4 hover:underline"
            >
              Their public seller page
              <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
            </Link>
          ) : null}
        </div>

        <div className="min-w-0 lg:sticky lg:top-24">
          <UserControls
            userId={person.id}
            currentRole={person.role}
            banned={person.banned}
            canSetRole={staff.role === "SUPERADMIN"}
            labels={ROLE_LABELS}
            blurbs={ROLE_BLURBS}
          />
          {staff.role === "SUPERADMIN" ? null : (
            <p className="mt-3 text-xs leading-relaxed text-subtle">
              Only a superadmin can change what someone can reach. You can still
              suspend or restore the account.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
