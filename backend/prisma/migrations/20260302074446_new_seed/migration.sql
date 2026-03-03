-- CreateEnum
CREATE TYPE "DocumentAnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('INGEST', 'ENRICH', 'ANALYZE_DOCUMENT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "agencySdvosbRate" DOUBLE PRECISION,
ADD COLUMN     "agencySmallBizRate" DOUBLE PRECISION,
ADD COLUMN     "competitionCount" INTEGER,
ADD COLUMN     "documentIntelScore" DOUBLE PRECISION,
ADD COLUMN     "historicalAvgAward" DOUBLE PRECISION,
ADD COLUMN     "historicalAwardCount" INTEGER,
ADD COLUMN     "historicalWinner" TEXT,
ADD COLUMN     "incumbentProbability" DOUBLE PRECISION,
ADD COLUMN     "incumbentSignalDetected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEnriched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recompeteFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scopeAlignmentScore" DOUBLE PRECISION,
ADD COLUMN     "technicalComplexScore" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "award_history" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "awardingAgency" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientUei" TEXT,
    "awardAmount" DOUBLE PRECISION NOT NULL,
    "awardDate" TIMESTAMP(3) NOT NULL,
    "baseAndAllOptions" DOUBLE PRECISION,
    "naics" TEXT,
    "psc" TEXT,
    "awardType" TEXT,
    "contractNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "award_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_documents" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analysisStatus" "DocumentAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "analysisError" TEXT,
    "scopeKeywords" TEXT[],
    "complexityScore" DOUBLE PRECISION,
    "alignmentScore" DOUBLE PRECISION,
    "incumbentSignals" TEXT[],
    "rawAnalysis" JSONB,
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
    "consultingFirmId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "opportunitiesFound" INTEGER,
    "opportunitiesNew" INTEGER,
    "enrichedCount" INTEGER,
    "scoringJobsQueued" INTEGER,
    "errors" INTEGER,
    "errorDetail" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "award_history_opportunityId_idx" ON "award_history"("opportunityId");

-- CreateIndex
CREATE INDEX "award_history_recipientName_idx" ON "award_history"("recipientName");

-- CreateIndex
CREATE INDEX "award_history_naics_idx" ON "award_history"("naics");

-- CreateIndex
CREATE INDEX "opportunity_documents_opportunityId_idx" ON "opportunity_documents"("opportunityId");

-- CreateIndex
CREATE INDEX "ingestion_jobs_consultingFirmId_idx" ON "ingestion_jobs"("consultingFirmId");

-- CreateIndex
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs"("status");

-- AddForeignKey
ALTER TABLE "award_history" ADD CONSTRAINT "award_history_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_documents" ADD CONSTRAINT "opportunity_documents_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_consultingFirmId_fkey" FOREIGN KEY ("consultingFirmId") REFERENCES "consulting_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
