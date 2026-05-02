# GovCon Platform — Quick Start Guide for Phase 1A

**TL;DR:** Schema extended, 663 lines of production code added, ready to test. Run migration, restart backend, upload RFP.

---

## In 5 Minutes

### What Was Done Today
1. Strategy reviewed (identified architectural issues)
2. CLAUDE.md updated with corrections
3. Requirement extraction system implemented (backend only)
4. Ready for testing and frontend development

### What You Need to Do Now
```bash
# 1. Run migration
cd govcon-platform/backend
npx prisma migrate dev --name enhance_requirement_extraction

# 2. Restart backend
docker compose restart govcon_backend

# 3. Test with curl
curl -X POST http://localhost:3001/api/documents/upload \
  -H "Authorization: Bearer <your-jwt>" \
  -F "file=@/path/to/RFP.pdf" \
  -F "opportunityId=your-opp-id"

# 4. Monitor logs
docker logs govcon_backend -f | grep extraction

# 5. View results (after ~30-60 seconds)
curl http://localhost:3001/api/compliance-matrix/your-opp-id/requirements \
  -H "Authorization: Bearer <your-jwt>"
```

---

## Files to Know

### Critical (Read These First)
- **CLAUDE.md** — Strategy, scope, architecture (primary reference)
- **FINAL_STATUS_REPORT.md** — What was done, status, next steps

### Implementation Details
- **PHASE_1A_IMPLEMENTATION_COMPLETE.md** — Code, testing guide, known issues
- **IMPLEMENTATION_PLAN_PHASE_1.md** — Phases 1A-1D detailed roadmap

### Architecture Decisions
- **STRATEGY_REVIEW.md** — Why we made certain choices (reference only)

---

## Schema Changes

**OpportunityDocument** gets 5 new fields:
```sql
extractionStatus VARCHAR DEFAULT 'PENDING'        -- PENDING, EXTRACTING, EXTRACTED, FAILED
extractedRequirementCount INTEGER DEFAULT 0
extractionConfidence FLOAT
extractionError TEXT
extractedAt TIMESTAMP
```

**MatrixRequirement** gets 8 new fields:
```sql
sourceDocumentId UUID                              -- FK to OpportunityDocument
sourcePageNumber INTEGER
extractionMethod VARCHAR DEFAULT 'AI'              -- AI, MANUAL, HYBRID
extractionConfidence FLOAT DEFAULT 0.8
isManuallyVerified BOOLEAN DEFAULT false
manualOverrideReason TEXT
proposalSectionId UUID                             -- For Phase 1B
coverageStatus VARCHAR DEFAULT 'UNCOVERED'         -- UNCOVERED, PARTIAL, COVERED
coverageScore FLOAT DEFAULT 0
```

---

## New Code Files

**Add These to Your Git Repo:**

```
backend/src/services/requirementExtractor.ts     (180 lines)
backend/src/workers/requirementExtractionWorker.ts (270 lines)
```

**Modify These Existing Files:**

```
backend/prisma/schema.prisma           (+40 lines)
backend/src/server.ts                  (+3 lines)
backend/src/routes/documents.ts        (+20 lines)
backend/src/routes/complianceMatrix.ts (+150 lines)
```

---

## New API Endpoints

### GET `/api/compliance-matrix/:opportunityId/requirements`
Returns extracted requirements with source document info.

**Optional query params:**
- `sourceDocumentId=doc-123` — Filter by specific document

**Example response:**
```json
[
  {
    "id": "req-1",
    "requirementText": "System shall provide...",
    "isMandatory": true,
    "sourceDocumentId": "doc-123",
    "sourcePageNumber": 12,
    "extractionConfidence": 0.95,
    "sourceDocument": {
      "fileName": "RFP.pdf",
      "extractionStatus": "EXTRACTED"
    }
  }
]
```

### PATCH `/api/compliance-matrix/:opportunityId/requirements/:requirementId`
Manually override requirement with reason tracking.

**Request body:**
```json
{
  "requirementText": "Corrected text",
  "isMandatory": true,
  "overrideReason": "PDF OCR error — manual correction"
}
```

**Result:** `isManuallyVerified` set to true, reason logged.

### POST `/api/compliance-matrix/:opportunityId/refresh`
Re-extract requirements from all documents.

**Response:**
```json
{
  "success": true,
  "message": "Queued 2 document(s) for requirement re-extraction...",
  "queuedCount": 2
}
```

---

## How It Works (30 Second Version)

1. **User uploads RFP** → POST /documents/upload
2. **Backend queues job** → BullMQ (Redis)
3. **Worker picks up job** → Reads file, calls extractRequirementsFromPDF()
4. **Claude extracts requirements** → Via llmRouter (respects firm's LLM choice)
5. **Requirements stored** → MatrixRequirement rows with source document link
6. **User sees results** → GET /compliance-matrix/:id/requirements
7. **User can override** → PATCH with reason tracked in DB

---

## Testing Checklist

### Before You Start
- [ ] PostgreSQL running
- [ ] Redis running (`redis-cli PING`)
- [ ] Backend has Anthropic API key (check `backend/.env`)
- [ ] `pdf-parse` and `bullmq` npm packages installed

### Quick Test (5 minutes)
- [ ] Run migration: `npx prisma migrate dev --name enhance_requirement_extraction`
- [ ] Restart backend: `docker compose restart govcon_backend`
- [ ] Upload RFP via API
- [ ] Check logs for "extraction queued"
- [ ] Wait 30 seconds
- [ ] Check extraction status: `SELECT * FROM opportunity_documents WHERE id='...'`
- [ ] Verify `extractionStatus` = 'EXTRACTED'
- [ ] Query requirements: `SELECT * FROM matrix_requirements WHERE sourceDocumentId='...'`

### Full Test (30 minutes)
1. Upload document (verify PENDING → EXTRACTING → EXTRACTED)
2. View extracted requirements (verify sourceDocumentId populated)
3. Override a requirement (verify isManuallyVerified flag set)
4. Refresh extraction (verify new job queued)
5. Monitor logs for errors (verify graceful error handling)

---

## If Something Breaks

### Extraction Not Starting
**Problem:** Document uploaded but extractionStatus stays PENDING
**Check:**
1. `redis-cli KEYS "bull:requirement-extraction:*"` — Are jobs in queue?
2. `docker logs govcon_backend | grep requirement` — Any errors?
3. `redis-cli MONITOR` — Watching job creation?

**Fix:** Check Redis is running, Anthropic API key is set, worker thread is alive

### Worker Failing
**Problem:** Extract extraction jobs fail after 3 retries
**Check:**
1. Check logs: `docker logs govcon_backend 2>&1 | grep -i error`
2. Check DB: `SELECT extractionError FROM opportunity_documents WHERE id='...'`
3. Check file: `ls -la uploads/` — Is file there?

**Fix:** Most likely Claude API error (rate limit, invalid key, network issue)

### Wrong Requirements Extracted
**Problem:** Requirements are inaccurate or incomplete
**Fix:** 
1. Manually override via PATCH endpoint
2. Improve Claude prompt in `requirementExtractor.ts`
3. Re-extract: POST `/compliance-matrix/:id/refresh`

---

## FAQ

**Q: Why are requirements extracted, not manually entered?**
A: Automation saves time. Inaccurate extractions can be manually corrected.

**Q: Can I disable automatic extraction?**
A: Not yet. It always queues. Manual extraction refresh is available via POST `/refresh`.

**Q: What happens to old requirements when I re-extract?**
A: Re-extraction creates NEW requirements. Old ones are not deleted (to preserve manual overrides).

**Q: Can I extract from multiple documents?**
A: Yes. Each document is processed separately. Requirements from all documents show in same matrix.

**Q: How do I know extraction is working?**
A: Check logs for "Requirement extraction completed" or view `extractionStatus` field.

**Q: Does extraction cost money?**
A: Yes, it calls Claude API. Cost per 1000 tokens is ~$3 input, ~$15 output.

---

## Next: Building the Frontend

See **IMPLEMENTATION_PLAN_PHASE_1.md** section 1A.6 for React component code.

Component shows:
- List of uploaded documents
- Extraction status (PENDING → EXTRACTING → EXTRACTED)
- Number of extracted requirements
- Extraction confidence %
- Error messages if failed
- "Refresh extraction" button

Estimated time: 2-3 hours

---

## Still Have Questions?

| Question | Answer Location |
|----------|-----------------|
| What's the overall strategy? | CLAUDE.md |
| Why were certain decisions made? | STRATEGY_REVIEW.md |
| How do I test this? | PHASE_1A_IMPLEMENTATION_COMPLETE.md |
| What's Phase 1B-1D? | IMPLEMENTATION_PLAN_PHASE_1.md |
| What changed in the code? | PHASE_1A_IMPLEMENTATION_COMPLETE.md (Code Statistics table) |
| How do I deploy this? | PHASE_1A_IMPLEMENTATION_COMPLETE.md (Migration & Deployment section) |

---

## TL;DR of TL;DR

✅ **Backend:** Done. 663 lines. Ready to test.  
🟡 **Frontend:** TODO. ~2-3 hours work.  
📅 **Timeline:** Phase 1 complete in 4 weeks (1B+1C+1D still needed).  
🎯 **Success:** Extract RFP → View requirements → Map sections → Add evidence → Export in <30 min.

Run the migration. Restart the server. Test with an RFP. Build the UI.

---

**Ready?** Let's go. 🚀
