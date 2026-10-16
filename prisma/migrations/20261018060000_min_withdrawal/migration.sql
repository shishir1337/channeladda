-- The smallest withdrawal finance will send.
--
-- A crypto payout pays the chain's fee whatever its size, so below some figure
-- the seller pays more to receive the money than the money is worth. Which
-- figure depends on the network, which is why this is a column the admin can
-- change rather than a constant someone has to redeploy.
--
-- $20 to start with: TRON is cents, but Ethereum at a bad moment is not, and a
-- minimum that is too high is a support ticket while one that is too low is a
-- seller out of pocket.
ALTER TABLE "PlatformSettings"
  ADD COLUMN "minWithdrawalUsd" INTEGER NOT NULL DEFAULT 2000;
