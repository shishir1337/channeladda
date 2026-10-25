import {
  ArrowUpRightIcon,
  BadgeCheckIcon,
  HourglassIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Fact,
  Facts,
  PageHeader,
} from "@/components/app/kit";
import { VerifiedBadge } from "@/components/app/verified-badge";
import { VerificationForm } from "@/components/dashboard/verification-form";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { documentLabel, KYC_REVIEW_HOURS } from "@/lib/kyc";
import { getMyVerification } from "@/server/kyc";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Verification",
  robots: { index: false, follow: false },
};

const DATE: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * Getting the Verified badge.
 *
 * Its own page rather than a card on Profile: the form asks for an ID, two
 * photos and a video, with instructions for each, which would bury the
 * profile under it. Profile, the rail and both account menus link here.
 *
 * Optional, and the page says so before it asks for anything: buying,
 * selling and withdrawing never wait on it (the owner, 2026-10-26).
 */
export default async function VerificationPage() {
  const user = await requireUser("/dashboard/verification");
  const [mine, me] = await Promise.all([
    getMyVerification(user.id),
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true, country: true, slug: true },
    }),
  ]);

  const canSend = mine.status === "NOT_STARTED" || mine.status === "REJECTED";

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/profile", label: "Profile" }}
        title="Verification"
        description={
          mine.status === "APPROVED"
            ? "Your ID is checked. The Verified badge shows beside your name."
            : "Optional. Get the Verified badge beside your name."
        }
      />

      <div className="flex flex-col gap-5">
        {mine.status === "APPROVED" ? (
          <Card tone="verified">
            <CardHeader
              as="h2"
              icon={BadgeCheckIcon}
              title="You're verified"
              actions={<VerifiedBadge size="md" />}
            />
            <CardBody>
              <p className="text-sm leading-relaxed text-fg">
                Buyers and sellers see the Verified badge beside your name: on
                your public page, on your listings and in the sellers list.
              </p>
              {me.slug ? (
                <Button asChild size="sm" variant="secondary" className="mt-4">
                  <Link href={`/seller/${me.slug}`}>
                    See your public page
                    <ArrowUpRightIcon aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        {mine.status === "PENDING" ? (
          <Card>
            <CardHeader
              as="h2"
              icon={HourglassIcon}
              title="We're checking your documents"
              description={`Usually within ${KYC_REVIEW_HOURS} hours. We'll tell you here and by email.`}
            />
            <CardBody className="py-1.5 sm:py-1.5">
              <Facts>
                <Fact label="ID sent">{documentLabel(mine.documentType)}</Fact>
                {mine.submittedAt ? (
                  <Fact label="Sent">
                    {mine.submittedAt.toLocaleString("en-GB", DATE)}
                  </Fact>
                ) : null}
              </Facts>
            </CardBody>
          </Card>
        ) : null}

        {mine.status === "REJECTED" ? (
          <Callout tone="warning" role="status" title="We couldn't verify you">
            <p className="text-fg">
              {mine.reason ?? "Your last check was not approved."}
            </p>
            <p className="mt-1">You can try again below.</p>
          </Callout>
        ) : null}

        {mine.status === "NOT_STARTED" ? (
          <Card>
            <CardHeader
              as="h2"
              icon={BadgeCheckIcon}
              title="Get the Verified badge"
              description="It tells buyers and sellers a real person is behind your account."
            />
            <CardBody>
              {/* Labelled as a preview: shown bare, it read as if they were
                  verified already. */}
              <p className="text-xs text-subtle">How your name will look</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-sm font-semibold text-fg">
                {me.name}
                <VerifiedBadge />
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-[0.8125rem] leading-relaxed text-muted">
                <li>You can buy and sell without it.</li>
                <li>Takes about five minutes on your phone.</li>
                <li>
                  A person checks it, usually within {KYC_REVIEW_HOURS} hours.
                </li>
              </ul>
            </CardBody>
          </Card>
        ) : null}

        {canSend ? (
          <Card>
            <CardHeader
              as="h2"
              icon={ShieldCheckIcon}
              title={
                mine.status === "REJECTED" ? "Send it again" : "Send your ID"
              }
              description="Aadhaar card, PAN card, passport or another government ID, and a short selfie video."
            />
            <CardBody>
              <VerificationForm
                defaultName={me.name}
                defaultCountry={me.country ?? ""}
              />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
