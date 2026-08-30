import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserControls } from "@/components/admin/user-controls";
import { getUserDetail, ROLE_BLURBS, ROLE_LABELS } from "@/server/admin-users";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3.5">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-fg">{value}</dd>
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
        className="inline-flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        All people
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-3xl font-black tracking-tight text-fg">
          {person.name}
        </h1>
        <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted">
          {ROLE_LABELS[person.role]}
        </span>
        {person.banned ? (
          <span className="rounded-full border border-danger/30 bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger">
            Suspended
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">{person.email}</p>

      {person.banned && person.banReason ? (
        <p className="mt-4 rounded-panel border border-danger/30 bg-danger-soft p-3.5 text-sm text-fg">
          <strong className="font-semibold">Suspended.</strong>{" "}
          {person.banReason}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact label="Listed" value={person.listings} />
            <Fact label="Sold" value={person.sold} />
            <Fact label="Bought" value={person.bought} />
            <Fact label="Conversations open" value={person.openThreads} />
            <Fact
              label="Threads flagged"
              value={
                person.flaggedThreads > 0 ? (
                  <span className="text-danger">{person.flaggedThreads}</span>
                ) : (
                  0
                )
              }
            />
            <Fact label="Active sessions" value={person.sessions} />
            <Fact
              label="Email"
              value={person.emailVerified ? "Verified" : "Unverified"}
            />
            <Fact
              label="Identity"
              value={person.kycStatus.replace(/_/g, " ")}
            />
            <Fact
              label="Joined"
              value={person.createdAt.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            />
          </dl>

          {person.slug ? (
            <p className="mt-4 text-sm">
              <Link
                href={`/seller/${person.slug}`}
                className="font-medium text-primary-text underline-offset-4 hover:underline"
              >
                View their public seller page
              </Link>
            </p>
          ) : null}
        </div>

        <div className="lg:sticky lg:top-24">
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
              Only a superadmin can change what someone can reach.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
