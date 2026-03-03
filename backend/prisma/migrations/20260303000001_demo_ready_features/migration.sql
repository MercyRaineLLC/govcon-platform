-- =============================================================
-- Demo-Ready Features Migration
-- Adds: scoreBreakdown, plainLanguageSummary, ClientPortalUser,
--       DocumentRequirement, ComplianceReward
-- =============================================================

-- Add scoreBreakdown to opportunities
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "score_breakdown" JSONB;

-- Add plain language interpretation to amendments
ALTER TABLE "amendments" ADD COLUMN IF NOT EXISTS "plain_language_summary" TEXT;
ALTER TABLE "amendments" ADD COLUMN IF NOT EXISTS "interpreted_at" TIMESTAMP(3);

-- =============================================================
-- CLIENT PORTAL USERS
-- =============================================================
CREATE TABLE IF NOT EXISTS "client_portal_users" (
    "id"               TEXT NOT NULL,
    "clientCompanyId"  TEXT NOT NULL,
    "email"            TEXT NOT NULL,
    "passwordHash"     TEXT NOT NULL,
    "firstName"        TEXT NOT NULL,
    "lastName"         TEXT NOT NULL,
    "isActive"         BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt"      TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_portal_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_portal_users_email_key"
    ON "client_portal_users"("email");

CREATE INDEX IF NOT EXISTS "client_portal_users_clientCompanyId_idx"
    ON "client_portal_users"("clientCompanyId");

ALTER TABLE "client_portal_users"
    ADD CONSTRAINT "client_portal_users_clientCompanyId_fkey"
    FOREIGN KEY ("clientCompanyId")
    REFERENCES "client_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

-- =============================================================
-- DOCUMENT REQUIREMENTS
-- =============================================================
CREATE TABLE IF NOT EXISTS "document_requirements" (
    "id"               TEXT NOT NULL,
    "consultingFirmId" TEXT NOT NULL,
    "clientCompanyId"  TEXT NOT NULL,
    "opportunityId"    TEXT,
    "title"            TEXT NOT NULL,
    "description"      TEXT,
    "dueDate"          TIMESTAMP(3) NOT NULL,
    "isPenaltyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "penaltyAmount"    DECIMAL(12,2),
    "penaltyPercent"   DECIMAL(5,2),
    "status"           TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt"      TIMESTAMP(3),
    "notes"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_requirements_consultingFirmId_idx"
    ON "document_requirements"("consultingFirmId");

CREATE INDEX IF NOT EXISTS "document_requirements_clientCompanyId_idx"
    ON "document_requirements"("clientCompanyId");

CREATE INDEX IF NOT EXISTS "document_requirements_opportunityId_idx"
    ON "document_requirements"("opportunityId");

ALTER TABLE "document_requirements"
    ADD CONSTRAINT "document_requirements_consultingFirmId_fkey"
    FOREIGN KEY ("consultingFirmId")
    REFERENCES "consulting_firms"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "document_requirements"
    ADD CONSTRAINT "document_requirements_clientCompanyId_fkey"
    FOREIGN KEY ("clientCompanyId")
    REFERENCES "client_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "document_requirements"
    ADD CONSTRAINT "document_requirements_opportunityId_fkey"
    FOREIGN KEY ("opportunityId")
    REFERENCES "opportunities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

-- =============================================================
-- COMPLIANCE REWARDS
-- =============================================================
CREATE TABLE IF NOT EXISTS "compliance_rewards" (
    "id"              TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "rewardType"      TEXT NOT NULL,
    "description"     TEXT NOT NULL,
    "value"           DECIMAL(12,2),
    "percentDiscount" DECIMAL(5,2),
    "isRedeemed"      BOOLEAN NOT NULL DEFAULT false,
    "redeemedAt"      TIMESTAMP(3),
    "expiresAt"       TIMESTAMP(3),
    "triggerReason"   TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_rewards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "compliance_rewards_clientCompanyId_idx"
    ON "compliance_rewards"("clientCompanyId");

ALTER TABLE "compliance_rewards"
    ADD CONSTRAINT "compliance_rewards_clientCompanyId_fkey"
    FOREIGN KEY ("clientCompanyId")
    REFERENCES "client_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;
