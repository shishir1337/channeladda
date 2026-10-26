-- The buyer's fee goes from 3% to 5% on both deal types (the owner,
-- 2026-10-26). New settings start at 5%; a site still on the old 3%
-- default moves with it. A rate an admin set to anything else is left.
ALTER TABLE "PlatformSettings" ALTER COLUMN "buyerFeeBpSafest" SET DEFAULT 500;
ALTER TABLE "PlatformSettings" ALTER COLUMN "buyerFeeBpFastest" SET DEFAULT 500;

UPDATE "PlatformSettings" SET "buyerFeeBpSafest" = 500 WHERE "buyerFeeBpSafest" = 300;
UPDATE "PlatformSettings" SET "buyerFeeBpFastest" = 500 WHERE "buyerFeeBpFastest" = 300;
