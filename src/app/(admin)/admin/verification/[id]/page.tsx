import {
  DownloadIcon,
  ExternalLinkIcon,
  FingerprintIcon,
  ImageIcon,
  UserRoundIcon,
  VideoIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerificationDecision } from "@/components/admin/verification-decision";
import { Waited } from "@/components/admin/vocab";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Fact,
  Facts,
  PageHeader,
} from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import type { KycStatus, UserRole } from "@/generated/prisma/enums";
import { documentLabel, documentOption, sameName } from "@/lib/kyc";
import { dayAndTime, longDate } from "@/lib/time";
import { getKycReview } from "@/server/kyc";
import { requireRole } from "@/server/session";
import { viewerZone } from "@/server/viewer-zone";

export const metadata: Metadata = {
  title: "ID check",
  robots: { index: false, follow: false },
};

const STATUS: Record<
  KycStatus,
  { label: string; variant: "neutral" | "info" | "verified" | "warning" }
> = {
  NOT_STARTED: { label: "Withdrawn", variant: "neutral" },
  PENDING: { label: "Waiting", variant: "info" },
  APPROVED: { label: "Approved", variant: "verified" },
  REJECTED: { label: "Not approved", variant: "warning" },
};

const STAFF: readonly UserRole[] = ["MODERATOR", "FINANCE", "SUPERADMIN"];

const link =
  "inline-flex min-h-11 items-center gap-1.5 text-[0.8125rem] font-medium text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg hover:decoration-fg pointer-fine:min-h-6";

/**
 * One ID check: the photos, the video, what they typed beside what the
 * account says, and the decision.
 *
 * The files are drawn straight from the private upload route, which serves
 * them to MODERATOR and SUPERADMIN and to nobody else on staff — the same
 * roles this page is open to. Nothing here copies a file anywhere.
 */
export default async function VerificationReviewPage({
  params,
}: PageProps<"/admin/verification/[id]">) {
  const staff = await requireRole("MODERATOR");
  const { id } = await params;
  const zone = await viewerZone();

  const review = await getKycReview(id);
  if (!review) notFound();

  const status = STATUS[review.status];
  const waiting = review.status === "PENDING";
  const own = review.member.id === staff.id;
  // The rule `setKycStatus` enforces: only a superadmin decides a
  // colleague's check. An agent is not staff for this.
  const outranked =
    STAFF.includes(review.member.role) && staff.role !== "SUPERADMIN";
  const nameMatches = sameName(review.fullName, review.member.name);
  const doc = review.documentType ? documentOption(review.documentType) : null;
  const banned = review.sameDocument.filter((p) => p.banned);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/verification", label: "ID checks" }}
        title={review.fullName}
        description={`${documentLabel(review.documentType)} · ${review.country}`}
        meta={
          <>
            <Badge variant={status.variant}>{status.label}</Badge>
            {waiting ? <Waited since={review.submittedAt} /> : null}
            {review.attempts > 1 ? (
              <span className="text-muted">Try {review.attempts}</span>
            ) : null}
          </>
        }
      />

      {review.sameDocument.length > 0 ? (
        <Callout
          tone="warning"
          title={
            banned.length > 0
              ? "This ID is on a suspended account"
              : "This ID is on another account"
          }
          className="mb-6"
        >
          <p className="text-fg">
            The same photo, byte for byte, was sent or approved on another
            account. One person may be running two accounts, or coming back
            after a suspension.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {review.sameDocument.map((person) => (
              <li
                key={person.userId}
                className="flex flex-wrap items-center gap-x-2 gap-y-1"
              >
                <Link
                  href={`/admin/users/${person.userId}`}
                  className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
                >
                  {person.name}
                </Link>
                <span className="break-all text-muted">{person.email}</span>
                {person.banned ? (
                  <Badge variant="warning">Suspended</Badge>
                ) : null}
                <Badge variant={STATUS[person.kycStatus].variant}>
                  {STATUS[person.kycStatus].label === "Withdrawn"
                    ? "Not verified"
                    : STATUS[person.kycStatus].label}
                </Badge>
                {person.banReason ? (
                  <span className="text-muted">— {person.banReason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_21.5rem]">
        {/* ---- the evidence ---- */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader
              as="h2"
              icon={ImageIcon}
              title="The ID"
              description="Check the photo, the name and that nothing is edited or covered."
            />
            <CardBody>
              <ul className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                <Photo url={review.frontUrl} label={doc?.front ?? "Front"} />
                {review.backUrl ? (
                  <Photo url={review.backUrl} label="Back" />
                ) : (
                  <li className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-[0.8125rem] text-subtle">
                    {doc?.back ? "No back sent" : "No back needed for this ID"}
                  </li>
                )}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              as="h2"
              icon={VideoIcon}
              title="Selfie video"
              description="Same face as the ID, holding the same ID, saying their name and “Channel Adda”."
            />
            <CardBody>
              {review.videoUrl ? (
                <>
                  {/* biome-ignore lint/a11y/useMediaCaption: a member's identity video, reviewed by staff; there is no transcript to caption it with. */}
                  <video
                    src={review.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-[28rem] w-full rounded-lg border border-line bg-black"
                  />
                  <a href={review.videoUrl} download className={`${link} mt-2`}>
                    <DownloadIcon aria-hidden="true" className="size-3.5" />
                    Will not play? Download it
                  </a>
                </>
              ) : (
                <p className="text-sm text-muted">No video was sent.</p>
              )}
            </CardBody>
          </Card>
        </div>

        {/* ---- who, and the decision ---- */}
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="no-scrollbar flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            {waiting ? (
              own ? (
                <Callout title="This is your own check">
                  Another moderator has to decide it.
                </Callout>
              ) : outranked ? (
                <Callout title="A staff member's check">
                  Only a superadmin can decide this one.
                </Callout>
              ) : (
                <VerificationDecision submissionId={review.id} />
              )
            ) : (
              <Card>
                <CardHeader as="h2" title={status.label} />
                <CardBody className="py-1.5 sm:py-1.5">
                  <Facts>
                    {review.reviewerName ? (
                      <Fact label="By">{review.reviewerName}</Fact>
                    ) : null}
                    {review.reviewedAt ? (
                      <Fact label="On">
                        {dayAndTime(review.reviewedAt, zone)}
                      </Fact>
                    ) : null}
                  </Facts>
                  {review.status === "REJECTED" && review.reviewNote ? (
                    <p className="mt-2 mb-2 text-sm leading-relaxed break-words text-fg">
                      “{review.reviewNote}”
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader
                as="h2"
                icon={UserRoundIcon}
                title="Typed, and on the account"
              />
              <CardBody className="py-1.5 sm:py-1.5">
                <Facts>
                  <Fact label="Name on the ID">{review.fullName}</Fact>
                  <Fact
                    label="Account name"
                    tone={nameMatches ? "verified" : "primary"}
                  >
                    {review.member.name}
                    <span className="block text-xs font-normal text-muted">
                      {nameMatches ? "Matches" : "Different: check the ID"}
                    </span>
                  </Fact>
                  <Fact label="Country typed">{review.country}</Fact>
                  <Fact label="Profile country">
                    {review.member.country ?? "Not set"}
                  </Fact>
                  <Fact label="ID">{documentLabel(review.documentType)}</Fact>
                  <Fact label="Sent">
                    {dayAndTime(review.submittedAt, zone)}
                  </Fact>
                  <Fact label="Joined">
                    {longDate(review.member.joinedAt, zone)}
                  </Fact>
                </Facts>
              </CardBody>
              <div className="flex flex-wrap gap-x-4 border-t border-line px-3.5 py-2 sm:px-5">
                <Link
                  href={`/admin/users/${review.member.id}`}
                  className={link}
                >
                  <FingerprintIcon aria-hidden="true" className="size-3.5" />
                  Open the account
                </Link>
                {review.member.banned ? (
                  <Badge variant="warning" className="self-center">
                    Suspended
                  </Badge>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

/** One photo of the ID, contained rather than cropped, opening full size. */
function Photo({ url, label }: { url: string; label: string }) {
  return (
    <li className="min-w-0">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="group relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2 transition-colors duration-150 hover:border-line-strong"
      >
        {/* biome-ignore lint/performance/noImgElement: a private ID photo served per viewer; the image optimiser would fetch it without the viewer's session and cache it outside the check. */}
        <img
          src={url}
          alt={`ID, ${label.toLowerCase()}`}
          width={400}
          height={300}
          className="size-full object-contain"
        />
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md border border-line bg-surface/90 text-muted opacity-0 shadow-xs transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <ExternalLinkIcon className="size-3.5" />
        </span>
      </a>
      <p className="mt-2 text-[0.8125rem] text-muted">{label}</p>
    </li>
  );
}
