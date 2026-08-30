/*
  Warnings:

  - Added the required column `avatarUrl` to the `Listing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `coverUrl` to the `Listing` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "avatarUrl" TEXT NOT NULL,
ADD COLUMN     "coverUrl" TEXT NOT NULL;
