import {
  ArrowUpRightIcon,
  BadgeCheckIcon,
  BellIcon,
  GemIcon,
  ShieldCheckIcon,
  StarIcon,
  UserRoundIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  IconTile,
  List,
  ListItem,
  ListRow,
  PageHeader,
} from "@/components/app/kit";
import { pointsLabel, ResellerBadge } from "@/components/app/reseller-badge";
import { VerifiedBadge } from "@/components/app/verified-badge";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { Button } from "@/components/ui/button";
import type { KycStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { KYC_REVIEW_HOURS } from "@/lib/kyc";
import { longDate } from "@/lib/time";
import { ratingFor } from "@/server/reseller-status";
import { requireUser } from "@/server/session";
import { viewerZone } from "@/server/viewer-zone";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

/** The Verification row, by where their ID check stands. */
const VERIFY_ROW: Record<KycStatus, { title: string; meta: string }> = {
  NOT_STARTED: {
    title: "Get the Verified badge",
    meta: "Optional. Send your ID to show it beside your name",
  },
  PENDING: {
    title: "Checking your ID",
    meta: `Usually within ${KYC_REVIEW_HOURS} hours`,
  },
  APPROVED: {
    title: "Verified",
    meta: "The badge shows beside your name",
  },
  REJECTED: {
    title: "Your ID check was not approved",
    meta: "See why, and send it again",
  },
};

/**
 * Who you are on Channel Adda, and the one place to change it.
 *
 * There was no page for this at all: a member's name came from sign-up and
 * stayed, and their public page could only be found by its address.
 */
export default async function ProfilePage() {
  const user = await requireUser("/dashboard/profile");
  const zone = await viewerZone();
  const [me, rating] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        name: true,
        country: true,
        image: true,
        bio: true,
        slug: true,
        kycStatus: true,
      },
    }),
    ratingFor(user.id),
  ]);
  const verified = me.kycStatus === "APPROVED";

  return (
    <>
      <PageHeader
        title="Your profile"
        description="How buyers and sellers see you."
      />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader as="h2" icon={UserRoundIcon} title="About you" />
          <CardBody>
            <ProfileForm
              name={me.name}
              country={me.country}
              image={me.image}
              bio={me.bio}
              email={user.email}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            as="h2"
            icon={StarIcon}
            title="Your public page"
            actions={
              me.slug ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/seller/${me.slug}`}>
                    View
                    <ArrowUpRightIcon aria-hidden="true" />
                  </Link>
                </Button>
              ) : null
            }
          />
          <CardBody>
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
              <span className="font-semibold tabular-nums">
                {pointsLabel(rating.points)}
              </span>
              {verified ? <VerifiedBadge /> : null}
              {rating.reseller ? <ResellerBadge /> : null}
            </p>
            <p className="mt-1 text-[0.8125rem] text-muted">
              {me.slug
                ? "Points come from deals you finish, bought or sold."
                : "Your page appears once your first listing goes live."}
            </p>
          </CardBody>
        </Card>

        <List>
          <ListItem href="/dashboard/verification">
            <ListRow
              leading={<IconTile icon={BadgeCheckIcon} />}
              title={VERIFY_ROW[me.kycStatus].title}
              meta={VERIFY_ROW[me.kycStatus].meta}
              chevron
            />
          </ListItem>
          <ListItem href="/dashboard/wallet#reseller">
            <ListRow
              leading={<IconTile icon={GemIcon} />}
              title={
                rating.reseller && rating.endsAt
                  ? `Reseller badge until ${longDate(rating.endsAt, zone)}`
                  : "Get the Reseller badge"
              }
              meta="More points and lower fees"
              chevron
            />
          </ListItem>
          <ListItem href="/dashboard/security">
            <ListRow
              leading={<IconTile icon={ShieldCheckIcon} />}
              title="Email and password"
              meta="Change either one, or set up two-step sign-in"
              chevron
            />
          </ListItem>
          <ListItem href="/dashboard/wallet">
            <ListRow
              leading={<IconTile icon={WalletIcon} />}
              title="Wallet"
              meta="Balance and withdrawal address"
              chevron
            />
          </ListItem>
          <ListItem href="/dashboard/notifications">
            <ListRow
              leading={<IconTile icon={BellIcon} />}
              title="Notifications"
              chevron
            />
          </ListItem>
        </List>
      </div>
    </>
  );
}
