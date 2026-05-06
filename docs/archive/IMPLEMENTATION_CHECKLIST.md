# Implementation Checklist — Phase 1 Requirements Extraction

**Status:** Ready to Implement  
**Key Finding:** Local disk storage is used, not S3. Adjust file handling accordingly.

---

## PRE-IMPLEMENTATION VERIFICATION

- [ ] Confirm `uploads/` directory exists and is writable
- [ ] Verify multer is configured correctly (check `backend/src/middleware/upload.ts`)
- [ ] Confirm `pdf-parse` npm package is installed (needed for PDF text extraction)
- [ ] Verify `bullmq` npm package is installed (for worker jobs)
- [ ] Check Redis is running and accessible (for BullMQ job queue)
- [ ] Confirm Anthropic API key is configured in `backend/.env`

**Quick test:**
```bash
cd govcon-platform/backend
npm list pdf-parse bullmq
```

---

## PHASE 1A: SCHEMA EXTENSION

### Step 1: Update Prisma Schema
- [ ] Add extraction fields to `OpportunityDocument` model:
  - `extractionStatus` (String, default "PENDING")
  - `extractedRequirementCount` (Int, default 0)
  - `extractionConfidence` (Float nullable)
  - `extractionError` (String nullable)
  - `extractedAt` (DateTime nullable)

- [ ] Add source tracking to `MatrixRequirement` model:
  - `sourceDocumentId` (String nullable, FK to OpportunityDocument)
  - `sourcePageNumber` (Int nullable)
  - `extractionMethod` (String, default "AI")
  - `extractionConfidence` (Float, default 0.8)
  - `isManuallyVerified` (Boolean, default false)
  - `manualOverrideReason` (String nullable)
  - `proposalSectionId` (String nullable, for future use)
  - `coverageStatus` (String, default "UNCOVERED")
  - `coverageScore` (Float, default 0)

- [ ] Add relation from OpportunityDocument to MatrixRequirement:
  - `extractedRequirements MatrixRequirement[] @relation("SourceDocument")`

### Step 2: Create Migration
- [ ] Run: `npx prisma migrate dev --name enhance_requirement_extraction`
- [ ] Verify migration runs without errors
- [ ] Check database schema updated: `psql -U govcon_user -d govcon_platform -c "\d opportunity_documents"`

---

## PHASE 1A: SERVICE IMPLEMENTATION

### Step 3: Create Requirement Extractor Service
**File:** `backend/src/services/requirementExtractor.ts`

- [ ] Implement `extractRequirementsFromPDF()` function that:
  - Takes PDF buffer, consulting firm ID
  - Parses PDF using `pdfParse`
  - Chunks text by 50KB
  - Calls Claude via `generateWithRouter()` for each chunk
  - Returns `ExtractionResult` with requirements array

- [ ] Implement `deduplicateRequirements()` helper
  - Remove near-duplicates (same first 100 chars)

- [ ] Export types:
  - `ExtractedRequirement`
  - `ExtractionResult`

- [ ] Test locally:
  ```typescript
  // In isolated test file
  const result = await extractRequirementsFromPDF(
    fs.readFileSync('test.pdf'),
    'test-firm-id'
  );
  console.log(result);
  ```

---

### Step 4: Create Requirement Extraction Worker
**File:** `backend/src/workers/requirementExtractionWorker.ts`

- [ ] Create BullMQ worker that:
  - Listens to 'requirement-extraction' queue
  - Fetches OpportunityDocument from database
  - Reads file from disk using storageKey
  - Calls `extractRequirementsFromPDF()`
  - Creates MatrixRequirements with source document linking
  - Updates OpportunityDocument with extraction status

- [ ] Implement error handling with retries (3 attempts, exponential backoff)

- [ ] Export `queueRequirementExtraction()` function

- [ ] Update `backend/src/server.ts` to start worker on bootstrap:
  ```typescript
  import { startRequirementExtractionWorker } from './workers/requirementExtractionWorker';
  
  // In bootstrap():
  startRequirementExtractionWorker();
  ```

- [ ] Test locally:
  - Upload document
  - Verify job queued in Redis
  - Check logs for worker processing

---

## PHASE 1A: API ROUTES

### Step 5: Update Document Upload Route
**File:** `backend/src/routes/documents.ts`

- [ ] In POST `/upload` endpoint, after creating OpportunityDocument:
  ```typescript
  const { queueRequirementExtraction } = await import('../workers/requirementExtractionWorker');
  await queueRequirementExtraction(document.id);
  ```

- [ ] Return response indicating extraction is queued

---

### Step 6: Enhance Compliance Matrix Routes
**File:** `backend/src/routes/complianceMatrix.ts`

- [ ] Add GET `/api/compliance-matrix/:opportunityId/requirements`:
  - Support optional `sourceDocumentId` query filter
  - Include source document metadata in response

- [ ] Add PATCH `/api/compliance-matrix/:opportunityId/requirements/:requirementId`:
  - Allow override of `requirementText`, `isMandatory`
  - Require `overrideReason` parameter
  - Set `isManuallyVerified = true`
  - Log audit event

- [ ] Add POST `/api/compliance-matrix/:opportunityId/refresh`:
  - Queue all documents for re-extraction
  - Return count of queued documents

---

## PHASE 1A: FRONTEND

### Step 7: Create Requirement Extraction Status Component
**File:** `frontend/src/components/RequirementExtractionStatus.tsx`

- [ ] Component displays:
  - List of uploaded documents
  - Extraction status (PENDING, EXTRACTING, EXTRACTED, FAILED)
  - Requirement count when extracted
  - Extraction confidence %
  - Error message if failed

- [ ] Implement polling (every 3s) to update status
- [ ] Stop polling when all documents done extracting

- [ ] Test with document upload flow

---

### Step 8: Update Opportunity Document Upload UI
**File:** `frontend/src/pages/OpportunityDetail.tsx` or similar

- [ ] Add file upload form for RFP documents
- [ ] Show extraction status after upload
- [ ] Allow multiple document uploads
- [ ] Show "Refresh extraction" button

---

## PHASE 1A: TESTING

### Integration Test
- [ ] Upload small RFP PDF to test opportunity
- [ ] Verify OpportunityDocument created with `extractionStatus: 'PENDING'`
- [ ] Check BullMQ worker logs: `docker logs govcon_backend 2>&1 | grep requirement`
- [ ] Wait for extraction to complete (watch status column)
- [ ] Verify OpportunityDocument updated with `extractionStatus: 'EXTRACTED'`
- [ ] GET `/api/compliance-matrix/:opportunityId/requirements` → should return extracted requirements
- [ ] Verify each requirement has `sourceDocumentId` set

### Edge Cases
- [ ] Upload non-PDF file → should reject in upload route
- [ ] Upload PDF with no text → should return empty requirements
- [ ] API error during Claude call → worker should retry and eventually fail gracefully
- [ ] Manual override of requirement → verify override reason logged

---

## PHASE 1B: PROPOSAL SECTIONS (Deferred, but planned)

- [ ] Create `ProposalSection` schema entity
- [ ] Create `SectionRequirementLink` junction entity
- [ ] Enhance `generateProposalOutline()` to create sections
- [ ] Auto-link sections to requirements
- [ ] Build section edit UI with coverage tracking

---

## PHASE 1C: EVIDENCE ARTIFACTS (Deferred, but planned)

- [ ] Create `EvidenceArtifact` schema
- [ ] Create `SectionEvidenceLink` schema
- [ ] Build evidence upload/search routes
- [ ] Add evidence panel to section editor

---

## PHASE 1D: SUBMISSION READINESS (Deferred, but planned)

- [ ] Create readiness validation service
- [ ] Add readiness check routes
- [ ] Build readiness dashboard
- [ ] Implement export with override logging

---

## PRODUCTION CONSIDERATIONS

### Before Production Deployment:
- [ ] Migrate from local disk to S3:
  - Create S3 bucket
  - Update file upload to write to S3
  - Update file retrieval to read from S3
  - Update `requirementExtractor.ts` to use S3 download

- [ ] Enable document encryption at rest (S3 server-side encryption)

- [ ] Set up CloudWatch logging for worker jobs

- [ ] Configure BullMQ to use managed Redis (ElastiCache) instead of local

- [ ] Set up monitoring/alerting for failed extraction jobs

- [ ] Implement document retention policy (archive/delete old uploaded files)

---

## ESTIMATED EFFORT

| Task | Effort | Days |
|------|--------|------|
| Schema migration | 2 hours | 0.25 |
| Requirement extractor service | 4 hours | 0.5 |
| Worker setup | 3 hours | 0.4 |
| API routes | 2 hours | 0.25 |
| Frontend component | 3 hours | 0.4 |
| Integration testing | 4 hours | 0.5 |
| **TOTAL Phase 1A** | **18 hours** | **2.3 days** |

---

## SUCCESS CRITERIA

- ✅ All 6 schema fields added and migrated
- ✅ Requirement extractor returns 95%+ accurate results
- ✅ Worker processes documents without errors
- ✅ Extracted requirements visible in compliance matrix
- ✅ Manual overrides tracked with reasons
- ✅ End-to-end test passes: Upload → Extract → View in < 2 min

---

## COMMON ISSUES & SOLUTIONS

| Issue | Solution |
|-------|----------|
| PDF parsing fails (corrupted/scanned PDF) | Check `pdf-parse` logs; ensure OCR not needed for MVP |
| Claude API timeout on large PDF | Already handled by chunking (50KB chunks) |
| Worker not processing jobs | Verify Redis is running: `redis-cli ping` |
| File not found on disk | Verify storageKey matches actual filename in uploads/ |
| Duplicate requirements extracted | Run deduplication; adjust threshold if needed |
| Low extraction confidence | May indicate poor OCR or complex formatting — OK for MVP |

---

## ROLLBACK PLAN

If Phase 1A needs to be reverted:
1. Run: `npx prisma migrate resolve --rolled-back enhance_requirement_extraction`
2. Revert schema to previous state
3. Remove worker job queue entries: `redis-cli DEL bull:requirement-extraction:*`

---

## NEXT CHECKPOINTS

- [ ] After schema: Verify migration applied, test basic CRUD
- [ ] After services: Unit test requirement extractor with sample PDF
- [ ] After worker: Integration test with BullMQ
- [ ] After routes: API test with curl/Postman
- [ ] After frontend: E2E test with browser
- [ ] Before merge: All tests passing, code review approved

---

**Owner:** Backend Lead  
**Reviewer:** Tech Lead  
**Status:** Ready to Start
