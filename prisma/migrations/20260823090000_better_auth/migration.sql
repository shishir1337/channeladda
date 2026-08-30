-- Better Auth takes over accounts and sessions.
--
-- Three of its four required User columns already existed under different
-- names or types, so this reshapes them in place rather than adding
-- duplicates that would drift. Password hashes move to "Account", which
-- becomes the only place in this database where one exists.

-- ---- User.emailVerified: timestamp -> boolean, keeping the timestamp ------
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "User" SET "emailVerifiedAt" = "emailVerified";

ALTER TABLE "User" ADD COLUMN "emailVerifiedBool" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "emailVerifiedBool" = ("emailVerified" IS NOT NULL);
ALTER TABLE "User" DROP COLUMN "emailVerified";
ALTER TABLE "User" RENAME COLUMN "emailVerifiedBool" TO "emailVerified";

-- ---- User.displayName -> User.name, now required -------------------------
ALTER TABLE "User" RENAME COLUMN "displayName" TO "name";
UPDATE "User" SET "name" = split_part("email", '@', 1) WHERE "name" IS NULL OR "name" = '';
ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;

-- ---- User.image, for ImageKit URLs ---------------------------------------
ALTER TABLE "User" ADD COLUMN "image" TEXT;

-- ---- Passwords leave User ------------------------------------------------
ALTER TABLE "User" DROP COLUMN "passwordHash";

-- ---- Session -------------------------------------------------------------
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Account -------------------------------------------------------------
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Account_issuer_accountId_key" ON "Account"("issuer", "accountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Verification --------------------------------------------------------
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");
