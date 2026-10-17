-- Two things an operator could not see or change without a developer.
--
-- 1. The payment window. It was PAYMENT_WINDOW_HOURS = 48 in deals.ts: how
--    long an unpaid deal holds its listing off the market. Tuning it meant a
--    deploy. The default keeps today's behaviour exactly.
--
-- 2. A heartbeat for the scheduled sweep. Nothing recorded whether the
--    crontab was running, so a dead one was silent — and its documented
--    consequence is abandoned deals holding listings for ever and lost
--    payment callbacks never reconciled. The sweep writes these on every
--    run; the staff overview reads them.

ALTER TABLE "PlatformSettings" ADD COLUMN "paymentWindowHours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "PlatformSettings" ADD COLUMN "lastSweepAt" TIMESTAMP(3);
ALTER TABLE "PlatformSettings" ADD COLUMN "lastSweepResult" JSONB;
