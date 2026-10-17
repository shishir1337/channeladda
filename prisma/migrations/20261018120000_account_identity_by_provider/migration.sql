-- Better Auth 1.7.3 went back to identifying a linked account by
-- (providerId, accountId), the 1.6 key, and stopped writing `issuer`. A
-- required column it never fills fails every new account, so the column and
-- its index go. Upstream: better-auth/better-auth#11153.
DROP INDEX "Account_issuer_accountId_key";

ALTER TABLE "Account" DROP COLUMN "issuer";

-- Better Auth now refuses to sign in when two accounts share a key rather
-- than picking one, so the database refuses to create the second.
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
