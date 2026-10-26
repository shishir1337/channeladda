-- An agent's transfer identity, per platform (QA, 2026-10-26). A Telegram
-- channel is handed to a Telegram username, not an email, and a Facebook
-- Page to a Facebook account. The existing agentEmail stays the Google
-- account (YouTube) and the email Instagram accounts, domains and hosting
-- move to. Additive only.
ALTER TABLE "User" ADD COLUMN "agentTelegram" TEXT;
ALTER TABLE "User" ADD COLUMN "agentFacebook" TEXT;
