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
import { dayAndTime } from "@/lib/time";
import { getMyVerification } from "@/server/kyc";
import { requireUser } from "@/server/session";
import { viewerZone } from "@/server/viewer-zone";

export const metadata: Metadata = {
  title: "Verification",
  robots: { index: false, follow: false },
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
  const zone = await viewerZone();
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
            : `Optional. Adds the Verified badge to your name. A person checks it within ${KYC_REVIEW_HOURS} hours.`
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
                  <Fact label="Sent">{dayAndTime(mine.submittedAt, zone)}</Fact>
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

        {canSend ? (
          <Card>
            <CardHeader
              as="h2"
              icon={ShieldCheckIcon}
              title={
                mine.status === "REJECTED" ? "Send it again" : "Send your ID"
              }
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
