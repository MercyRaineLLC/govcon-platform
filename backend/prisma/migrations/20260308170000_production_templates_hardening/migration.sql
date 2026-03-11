-- =============================================================
-- Production Hardening + Reusable Templates
-- =============================================================

-- Add optional template link to document requirements
ALTER TABLE "document_requirements"
  ADD COLUMN IF NOT EXISTS "templateId" TEXT;

CREATE INDEX IF NOT EXISTS "document_requirements_templateId_idx"
  ON "document_requirements"("templateId");

-- Create reusable document templates table
CREATE TABLE IF NOT EXISTS "document_templates" (
    "id"               TEXT NOT NULL,
    "consultingFirmId" TEXT NOT NULL,
    "createdById"      TEXT,
    "title"            TEXT NOT NULL,
    "description"      TEXT,
    "category"         TEXT,
    "fileName"         TEXT NOT NULL,
    "fileType"         TEXT NOT NULL,
    "fileSize"         INTEGER NOT NULL,
    "storageKey"       TEXT NOT NULL,
    "isActive"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_templates_consultingFirmId_idx"
  ON "document_templates"("consultingFirmId");

CREATE INDEX IF NOT EXISTS "document_templates_createdById_idx"
  ON "document_templates"("createdById");

ALTER TABLE "document_templates"
  ADD CONSTRAINT "document_templates_consultingFirmId_fkey"
  FOREIGN KEY ("consultingFirmId")
  REFERENCES "consulting_firms"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_templates"
  ADD CONSTRAINT "document_templates_createdById_fkey"
  FOREIGN KEY ("createdById")
  REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_requirements"
  ADD CONSTRAINT "document_requirements_templateId_fkey"
  FOREIGN KEY ("templateId")
  REFERENCES "document_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
