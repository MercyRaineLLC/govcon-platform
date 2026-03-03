/*
  Warnings:

  - A unique constraint covering the columns `[consultingFirmId,samNoticeId]` on the table `opportunities` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `complianceStatus` on the `bid_decisions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `recommendation` on the `bid_decisions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropIndex
DROP INDEX "opportunities_samNoticeId_key";

-- AlterTable
ALTER TABLE "bid_decisions" DROP COLUMN "complianceStatus",
ADD COLUMN     "complianceStatus" "ComplianceStatus" NOT NULL,
DROP COLUMN "recommendation",
ADD COLUMN     "recommendation" "Recommendation" NOT NULL;

-- CreateTable
CREATE TABLE "amendments" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "amendmentNumber" TEXT,
    "title" TEXT,
    "description" TEXT,
    "postedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amendments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "amendments_opportunityId_idx" ON "amendments"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_consultingFirmId_samNoticeId_key" ON "opportunities"("consultingFirmId", "samNoticeId");

-- AddForeignKey
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
