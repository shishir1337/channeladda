-- Fee rates move out of the code and into a row a superadmin can edit.
--
-- Rates are basis points so they stay integers: 300 is 3.00%. Storing 0.03 as
-- a float in a money path is how rounding errors get started.

CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "buyerFeeBp" INTEGER NOT NULL DEFAULT 300,
    "sellerFeeBp" INTEGER NOT NULL DEFAULT 500,
    "escrowRequiredAboveUsd" INTEGER NOT NULL DEFAULT 100000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlatformSettings" ADD CONSTRAINT "PlatformSettings_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The defaults are what the code has been using: 3% buyer, 5% seller, escrow
-- forced at $1,000. These remain unconfirmed by the business and are now
-- changeable without a deploy.
INSERT INTO "PlatformSettings" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP);
