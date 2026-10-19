-- Which deals somebody running deals may take, by agreed price. Null takes
-- any size, so every existing agent keeps working exactly as before.
CREATE TYPE "DealLevel" AS ENUM ('UNDER_10K', 'UNDER_100K', 'FROM_100K');

ALTER TABLE "User" ADD COLUMN "dealLevel" "DealLevel";
