-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "SetAsideType" AS ENUM ('NONE', 'SMALL_BUSINESS', 'SDVOSB', 'WOSB', 'HUBZONE', 'SBA_8A', 'TOTAL_SMALL_BUSINESS');

-- CreateEnum
CREATE TYPE "MarketCategory" AS ENUM ('SERVICES', 'SUPPLIES', 'CONSTRUCTION', 'IT', 'RESEARCH', 'MEDICAL', 'LOGISTICS', 'OTHER');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('ACTIVE', 'AWARDED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PenaltyType" AS ENUM ('FLAT_FEE', 'PERCENTAGE');

-- CreateTable
CREATE TABLE "consulting_firms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "flatLateFee" DOUBLE PRECISION,
    "penaltyPercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consulting_firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "consultingFirmId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CONSULTANT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_companies" (
    "id" TEXT NOT NULL,
    "consultingFirmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cage" TEXT,
    "uei" TEXT,
    "naicsCodes" TEXT[],
    "sdvosb" BOOLEAN NOT NULL DEFAULT false,
    "wosb" BOOLEAN NOT NULL DEFAULT false,
    "hubzone" BOOLEAN NOT NULL DEFAULT false,
    "smallBusiness" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "consultingFirmId" TEXT NOT NULL,
    "samNoticeId" TEXT,
    "title" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "subagency" TEXT,
    "office" TEXT,
    "naicsCode" TEXT NOT NULL,
    "naicsDescription" TEXT,
    "setAsideType" "SetAsideType" NOT NULL DEFAULT 'NONE',
    "marketCategory" "MarketCategory" NOT NULL DEFAULT 'SUPPLIES',
    "estimatedValue" DOUBLE PRECISION,
    "estimatedValueMin" DOUBLE PRECISION,
    "estimatedValueMax" DOUBLE PRECISION,
    "postedDate" TIMESTAMP(3),
    "responseDeadline" TIMESTAMP(3) NOT NULL,
    "archiveDate" TIMESTAMP(3),
    "placeOfPerformance" TEXT,
    "sourceUrl" TEXT,
    "description" TEXT,
    "attachments" JSONB,
    "probabilityScore" DOUBLE PRECISION DEFAULT 0,
    "expectedValue" DOUBLE PRECISION DEFAULT 0,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_records" (
    "id" TEXT NOT NULL,
    "consultingFirmId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "wasOnTime" BOOLEAN NOT NULL,
    "penaltyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_penalties" (
    "id" TEXT NOT NULL,
    "consultingFirmId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "submissionRecordId" TEXT NOT NULL,
    "penaltyType" "PenaltyType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "calculationBasis" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_stats" (
    "id" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "totalOpportunities" INTEGER NOT NULL DEFAULT 0,
    "totalSubmissions" INTEGER NOT NULL DEFAULT 0,
    "submissionsOnTime" INTEGER NOT NULL DEFAULT 0,
    "submissionsLate" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPenalties" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consulting_firms_contactEmail_key" ON "consulting_firms"("contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_consultingFirmId_idx" ON "users"("consultingFirmId");

-- CreateIndex
CREATE INDEX "client_companies_consultingFirmId_idx" ON "client_companies"("consultingFirmId");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_samNoticeId_key" ON "opportunities"("samNoticeId");

-- CreateIndex
CREATE INDEX "opportunities_consultingFirmId_idx" ON "opportunities"("consultingFirmId");

-- CreateIndex
CREATE INDEX "opportunities_naicsCode_idx" ON "opportunities"("naicsCode");

-- CreateIndex
CREATE INDEX "opportunities_agency_idx" ON "opportunities"("agency");

-- CreateIndex
CREATE INDEX "opportunities_responseDeadline_idx" ON "opportunities"("responseDeadline");

-- CreateIndex
CREATE INDEX "opportunities_probabilityScore_idx" ON "opportunities"("probabilityScore");

-- CreateIndex
CREATE INDEX "submission_records_clientCompanyId_idx" ON "submission_records"("clientCompanyId");

-- CreateIndex
CREATE INDEX "submission_records_opportunityId_idx" ON "submission_records"("opportunityId");

-- CreateIndex
CREATE INDEX "submission_records_consultingFirmId_idx" ON "submission_records"("consultingFirmId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_penalties_submissionRecordId_key" ON "financial_penalties"("submissionRecordId");

-- CreateIndex
CREATE INDEX "financial_penalties_consultingFirmId_idx" ON "financial_penalties"("consultingFirmId");

-- CreateIndex
CREATE INDEX "financial_penalties_clientCompanyId_idx" ON "financial_penalties"("clientCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_stats_clientCompanyId_key" ON "performance_stats"("clientCompanyId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_consultingFirmId_fkey" FOREIGN KEY ("consultingFirmId") REFERENCES "consulting_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_companies" ADD CONSTRAINT "client_companies_consultingFirmId_fkey" FOREIGN KEY ("consultingFirmId") REFERENCES "consulting_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_consultingFirmId_fkey" FOREIGN KEY ("consultingFirmId") REFERENCES "consulting_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_records" ADD CONSTRAINT "submission_records_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "client_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_records" ADD CONSTRAINT "submission_records_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_records" ADD CONSTRAINT "submission_records_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_penalties" ADD CONSTRAINT "financial_penalties_consultingFirmId_fkey" FOREIGN KEY ("consultingFirmId") REFERENCES "consulting_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_penalties" ADD CONSTRAINT "financial_penalties_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "client_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_penalties" ADD CONSTRAINT "financial_penalties_submissionRecordId_fkey" FOREIGN KEY ("submissionRecordId") REFERENCES "submission_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_stats" ADD CONSTRAINT "performance_stats_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "client_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
