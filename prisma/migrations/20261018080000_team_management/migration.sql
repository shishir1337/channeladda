-- Team and agent management.
--
-- Two things, both of which existed only in a terminal before this:
--
-- 1. An agent's own transfer identity. Order.agentEmail and Order.agentBrand
--    are typed in per deal by whoever assigns it, so the same agent reached
--    different sellers under different names, and a seller invited to hand a
--    channel to the wrong address hands it to nobody. These two columns are
--    the agent's stored default, copied onto the deal at assignment time.
--    Nullable: only an AGENT has one, and an existing agent has none until a
--    superadmin sets it.
--
-- 2. Staff invitations. `scripts/create-admin.ts` was the only way to make an
--    account with a role, which meant hiring anybody required a developer.
--    An invitation lets the invitee set their own password, so no password is
--    shared, typed on somebody else's behalf, or known to two people.
--
-- Nothing is backfilled and no existing row changes meaning.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "agentEmail" TEXT;
ALTER TABLE "User" ADD COLUMN     "agentBrand" TEXT;

-- CreateTable
--
-- `tokenHash` is a SHA-256 of the raw token, hex. The token is never stored:
-- a copy of this table must not be enough to accept an invitation. It is
-- unique both because accepting has to be one index hit and because two
-- invitations resolving to one token would be a collision nobody would spot.
CREATE TABLE "StaffInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvite_tokenHash_key" ON "StaffInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffInvite_email_idx" ON "StaffInvite"("email");

-- CreateIndex
-- The pending list is "neither accepted nor revoked", read on every visit to
-- the team page.
CREATE INDEX "StaffInvite_acceptedAt_revokedAt_idx" ON "StaffInvite"("acceptedAt", "revokedAt");

-- AddForeignKey
-- RESTRICT rather than CASCADE: an invitation is a record of who let somebody
-- in, and that record outliving the inviter's account is the point of it.
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
