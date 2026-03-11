-- Migration: Add extended profile fields to client_companies
-- Run: DATABASE_URL=... npx prisma db push --accept-data-loss (from backend/)

ALTER TABLE client_companies
  ADD COLUMN IF NOT EXISTS ein TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS street_address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS zip_code TEXT,
  ADD COLUMN IF NOT EXISTS sam_reg_status TEXT,
  ADD COLUMN IF NOT EXISTS sam_reg_expiry TIMESTAMPTZ;
