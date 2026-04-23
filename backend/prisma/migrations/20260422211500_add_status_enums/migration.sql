-- Create enum types for status fields
CREATE TYPE "IngestionJobType" AS ENUM ('INGEST', 'ENRICH', 'ANALYZE_DOCUMENT');
CREATE TYPE "IngestionJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'PARTIAL');
CREATE TYPE "DocumentAnalysisStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'FAILED', 'SKIPPED');
CREATE TYPE "DocumentRequirementStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED');
CREATE TYPE "MatrixRequirementStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PENDING_REVIEW', 'BLOCKED');
CREATE TYPE "ComplianceLogEntityType" AS ENUM ('SUBMISSION', 'BID_DECISION', 'OPPORTUNITY', 'CLIENT_COMPANY', 'DOCUMENT_REQUIREMENT', 'OTHER');

-- Alter ingestion_jobs table - drop default first, convert type, then add default back
ALTER TABLE "ingestion_jobs" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "ingestion_jobs" ALTER COLUMN "type" TYPE "IngestionJobType" USING "type"::"IngestionJobType";
ALTER TABLE "ingestion_jobs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ingestion_jobs" ALTER COLUMN "status" TYPE "IngestionJobStatus" USING "status"::"IngestionJobStatus";
ALTER TABLE "ingestion_jobs" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"IngestionJobStatus";

-- Alter opportunity_documents table
ALTER TABLE "opportunity_documents" ALTER COLUMN "analysisStatus" DROP DEFAULT;
ALTER TABLE "opportunity_documents" ALTER COLUMN "analysisStatus" TYPE "DocumentAnalysisStatus" USING "analysisStatus"::"DocumentAnalysisStatus";
ALTER TABLE "opportunity_documents" ALTER COLUMN "analysisStatus" SET DEFAULT 'PENDING'::"DocumentAnalysisStatus";

-- Alter document_requirements table
ALTER TABLE "document_requirements" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "document_requirements" ALTER COLUMN "status" TYPE "DocumentRequirementStatus" USING "status"::"DocumentRequirementStatus";
ALTER TABLE "document_requirements" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"DocumentRequirementStatus";

-- Alter matrix_requirements table
ALTER TABLE "matrix_requirements" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "matrix_requirements" ALTER COLUMN "status" TYPE "MatrixRequirementStatus" USING "status"::"MatrixRequirementStatus";
ALTER TABLE "matrix_requirements" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED'::"MatrixRequirementStatus";

-- Alter compliance_logs table
ALTER TABLE "compliance_logs" ALTER COLUMN "entityType" TYPE "ComplianceLogEntityType" USING "entityType"::"ComplianceLogEntityType";
