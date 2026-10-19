-- When a deal's hold ends nobody presses anything, so the sweep tells the
-- next person their step is open. This marks that it has, so a crontab
-- that runs every few minutes tells them once.
ALTER TABLE "Order" ADD COLUMN "holdNotifiedAt" TIMESTAMP(3);
