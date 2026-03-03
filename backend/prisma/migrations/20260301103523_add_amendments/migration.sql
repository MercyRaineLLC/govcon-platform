-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('PASS', 'CONDITIONAL', 'FAIL');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('BID_PRIME', 'BID_SUB', 'NO_BID');

-- AlterTable
ALTER TABLE "client_companies" ADD COLUMN     "preferredPscCodes" TEXT[];

-- CreateTable
CREATE TABLE "product_service_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "product_service_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_psc" (
    "opportunityId" TEXT NOT NULL,
    "pscId" TEXT NOT NULL,

    CONSTRAINT "opportunity_psc_pkey" PRIMARY KEY ("opportunityId","pscId")
);

-- CreateTable
CREATE TABLE "bid_decisions" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "winProbability" DOUBLE PRECISION NOT NULL,
    "expectedRevenue" DOUBLE PRECISION NOT NULL,
    "proposalCostEstimate" DOUBLE PRECISION NOT NULL,
    "expectedValue" DOUBLE PRECISION NOT NULL,
    "netExpectedValue" DOUBLE PRECISION NOT NULL,
    "roiRatio" DOUBLE PRECISION NOT NULL,
    "complianceStatus" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "explanationJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bid_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_service_codes_code_key" ON "product_service_codes"("code");

-- CreateIndex
CREATE INDEX "product_service_codes_code_idx" ON "product_service_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bid_decisions_opportunityId_clientCompanyId_key" ON "bid_decisions"("opportunityId", "clientCompanyId");

-- AddForeignKey
ALTER TABLE "opportunity_psc" ADD CONSTRAINT "opportunity_psc_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_psc" ADD CONSTRAINT "opportunity_psc_pscId_fkey" FOREIGN KEY ("pscId") REFERENCES "product_service_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_decisions" ADD CONSTRAINT "bid_decisions_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_decisions" ADD CONSTRAINT "bid_decisions_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "client_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
