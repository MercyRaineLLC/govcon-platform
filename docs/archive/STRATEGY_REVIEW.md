# Strategy Review — Current Architecture Analysis & Corrections

**Date:** 2026-04-22  
**Status:** Review Complete — Minor Corrections to CLAUDE.md Recommended

---

## EXECUTIVE SUMMARY

The existing codebase is **significantly more sophisticated** than suggested in CLAUDE.md. Key findings:

✅ **Strengths:**
- Opportunity-centric architecture (not solicitation-centric) is actually superior
- ComplianceMatrix already serves as solicitation proxy
- Multi-LLM routing is production-grade
- Token-based billing and tier gating are mature
- Document analysis and enrichment workers are in place
- Compliance matrix with requirement tracking exists

⚠️ **Gaps:**
- ComplianceMatrix requirements lack source document linking
- No explicit requirement extraction from uploaded RFPs
- No proposal section ↔ requirement mapping in schema
- Amendment tracking is minimal
- Evidence artifact management is missing
- Review workflow doesn't exist yet

**Recommendation:** Update CLAUDE.md to align with existing opportunity-centric model rather than creating new solicitation entities. Enhance existing services rather than duplicate.

---

## PART 1: ARCHITECTURE AUDIT

### What's Already Built

#### 1. **Opportunity-Centric Model** ✅
```
ConsultingFirm → Opportunity → ComplianceMatrix → MatrixRequirement
```

**Why this is smart:**
- Single source of truth per opportunity
- All other data (documents, submissions, decisions) naturally attach to Opportunity
- Matches federal procurement workflow (everything centers on the RFP/opportunity)

**Current entities:**
- `Opportunity` — RFP metadata + scoring breakdown
- `OpportunityDocument` — Uploaded documents with analysis status
- `ComplianceMatrix` — Requirement container (currently serving as "solicitation")
- `MatrixRequirement` — Individual must/should statements
- `Amendment` — Changes to opportunity (but minimal fields)

#### 2. **Multi-LLM Router** ✅
Location: `backend/src/services/llm/llmRouter.ts`

**Providers supported:**
- Claude (Anthropic) — Primary
- OpenAI (GPT-4)
- Deepseek
- LocalAI (self-hosted)
- Insight Engine (custom)

**Why this matters:**
- Don't hard-code Claude API calls; use the router
- Supports firm-level LLM provider selection
- Cost tracking per provider

#### 3. **Proposal Outline Generation** ✅
Location: `backend/src/services/proposalAssist.ts`

**Current capability:**
- Generates proposal outline from opportunity + requirements
- Produces structured JSON with sections, win themes, discriminators
- Uses router to call LLM

**Gap:** 
- Doesn't link sections to specific requirements
- Fallback outline hard-coded (not ideal)

#### 4. **Document Upload & Analysis** ✅
Location: `backend/src/routes/documents.ts`, `OpportunityDocument` model

**Current capability:**
- Upload documents to opportunities
- Run document analysis (extract scope keywords, complexity, alignment scores)
- Store analysis results

**Gap:**
- Analysis doesn't extract structured requirements from RFP text
- No OCR support for scanned PDFs

#### 5. **Compliance Matrix Routes** ✅
Location: `backend/src/routes/complianceMatrix.ts`

**Existing endpoints:**
```
POST   /api/compliance-matrix/:opportunityId     Create/update matrix
GET    /api/compliance-matrix/:opportunityId     Get matrix + requirements
PATCH  /api/compliance-matrix/:opportunityId/requirements   Update requirement
```

**Gap:**
- No source document linking (where did this requirement come from?)
- No proposal section mapping
- No evidence linking

#### 6. **Proposal Assist Routes** ✅
Location: `backend/src/routes/proposalAssist.ts`

**Existing endpoints:**
```
POST   /api/proposal-assist/:opportunityId/outline        Generate outline
POST   /api/proposal-assist/:opportunityId/questions      Extract evaluator questions
POST   /api/proposal-assist/:opportunityId/draft          Generate draft section
POST   /api/proposal-assist/:opportunityId/compliance     Check compliance
```

**Gap:**
- Compliance check is disconnected from requirements
- No evidence retrieval integrated

#### 7. **Worker Pattern** ✅
Location: `backend/src/workers/`

**Existing workers:**
- `scoringWorker.ts` — Calculates opportunity scores
- `enrichmentWorker.ts` — Enriches opportunity metadata
- `recalibrationWorker.ts` — Updates nightly scoring

**Pattern to follow:**
- Use BullMQ for async jobs
- Queue long-running tasks (parsing, generation, scoring)
- Store job status for UI polling

#### 8. **Token-Based Billing** ✅
Location: `backend/src/middleware/tierGate.ts`, `billing` routes

**Current model:**
- Proposal outline = 1 token
- Proposal draft = variable tokens
- Tokens purchased in "Proposal Token Packs"
- Firm-level token balance tracked

**Why this is smart:**
- Usage-based pricing aligns with LLM costs
- Prevents runaway AI spending

#### 9. **Compliance & Audit Trail** ✅
- Full JWT auth with tenant scoping
- All routes require `authenticateJWT` + `enforceTenantScope`
- Actions logged to analytics
- Supports role-based access (Admin, Consultant, etc.)

---

## PART 2: STRATEGIC FLAWS IN CLAUDE.MD

### Flaw 1: Proposed "Solicitation" Model Redundancy
**What I suggested:** Create separate `Solicitation` entity distinct from `Opportunity`.

**Why this is wrong:**
- Opportunity already IS the solicitation
- Creating a new entity duplicates data and complicates the model
- Federal workflow is opportunity → RFP → proposal; one logical entity

**Correction:**
- **Enhance `Opportunity` with additional RFP metadata**
- **Extend `ComplianceMatrix` to track requirement sources**
- **Don't create `Solicitation` model**

### Flaw 2: Document Parsing Service Structure
**What I suggested:** New `solicitationParser.ts` service with custom PDF parsing.

**Why this is partially wrong:**
- `DocumentAnalysisService` already exists and handles uploads
- Should integrate parsing into existing document analysis flow, not parallel service
- Should queue parsing as a worker job, not sync

**Correction:**
- **Enhance `DocumentAnalysisService` to extract requirements**
- **Create parsing worker (use existing worker pattern)**
- **Link extracted requirements back to OpportunityDocument**

### Flaw 3: Evidence Artifact vs. Client Document
**What I suggested:** New `EvidenceArtifact` entity.

**Why this is partially wrong:**
- `ClientDocument` entity likely already exists
- Need to check existing pattern before creating new entity

**Correction:**
- **Verify ClientDocument schema**
- **Extend if needed, don't duplicate**

### Flaw 4: API Route Organization
**What I suggested:** New `/api/solicitations/*` routes.

**Why this is wrong:**
- Existing routes are opportunity-centric (`/api/opportunities/*`)
- New requirements extraction should extend opportunity routes or compliance matrix routes

**Correction:**
- **Add to `/api/opportunities/:id/extract-requirements`**
- **Extend `/api/compliance-matrix/*` for requirement management**

---

## PART 3: CORRECTED STRATEGIC PRIORITIES

### Release 1: Solicitation Intelligence + Proposal Workflow (Revised)

#### Priority 1A: Requirement Extraction Enhancement (1-2 weeks)
**Goal:** Extract requirements from uploaded RFP documents using Claude

**What to build:**
1. **Extend OpportunityDocument schema:**
   - Add `requirementExtraction` Json field (for storing extraction confidence, source page, etc.)
   - Link MatrixRequirement back to OpportunityDocument

2. **Create `DocumentRequirementExtractor` service:**
   - Takes OpportunityDocument buffer
   - Uses Claude API via router to extract requirements
   - Returns structured requirements with source page, confidence, type

3. **Create parsing worker:**
   - Triggered when document uploaded to opportunity
   - Calls extractor service
   - Updates OpportunityDocument status
   - Creates MatrixRequirements with source tracking

4. **Enhance ComplianceMatrix routes:**
   - GET `/api/compliance-matrix/:opportunityId/requirements?sourceDocId=X` (filter by source)
   - PATCH requirement with manual override reason
   - POST `/api/compliance-matrix/:opportunityId/refresh` (re-extract from documents)

**Why this approach:**
- Leverages existing OpportunityDocument model
- Uses existing worker pattern (no new architecture)
- Integrates with existing ComplianceMatrix
- No schema duplication

---

#### Priority 1B: Requirement-Section Linking (1 week)
**Goal:** Map proposal sections to requirements with coverage tracking

**What to build:**
1. **Extend Opportunity model in schema:**
   ```prisma
   model Opportunity {
     ...
     // Proposal workspace
     proposalSections    ProposalSection[]
     sectionRequirementLinks SectionRequirementLink[]
   }
   
   model ProposalSection {
     id                String   @id @default(uuid())
     opportunityId     String
     title             String
     description       String?
     pageLimit         Int?
     coverageStatus    String   @default("UNCOVERED")  // UNCOVERED, PARTIAL, COVERED
     requirementLinks  SectionRequirementLink[]
     draft             String?  // Rich text draft
     draftVersion      Int      @default(0)
   }
   
   model SectionRequirementLink {
     id                String   @id @default(uuid())
     sectionId         String
     requirementId     String
     coverageScore     Float    @default(0)  // 0-1: how well requirement is addressed
     evidenceLinks     String[] @default([]) // IDs of linked evidence
   }
   ```

2. **Create ProposalSection routes:**
   - POST `/api/opportunities/:id/proposal-sections` (create from outline)
   - GET `/api/opportunities/:id/proposal-sections` (list all)
   - PATCH `/api/opportunities/:id/proposal-sections/:sectionId` (update draft + coverage)
   - GET `/api/opportunities/:id/proposal-sections/:sectionId/uncovered-requirements` (find gaps)

3. **Enhance proposalAssist service:**
   - When generating outline, create ProposalSections
   - Auto-link each section to relevant requirements (via Claude recommendation)
   - Return section-requirement mapping with outline

**Why this approach:**
- Natural extension of existing proposal outline flow
- No duplicate data
- Maintains opportunity-centric model

---

#### Priority 1C: Evidence Artifact Management (1 week)
**Goal:** Store and link supporting documents to proposal sections

**What to build:**
1. **Extend schema:**
   ```prisma
   model EvidenceArtifact {
     id                String   @id @default(uuid())
     opportunityId     String
     clientCompanyId   String
     title             String
     type              String   // CASE_STUDY, PAST_PERF, CERT, WHITEPAPER, etc.
     s3Key             String?  // File storage
     sourceUrl         String?  // External reference
     relevantNaics     String[] @default([])
     relevantAgencies  String[] @default([])
     createdAt         DateTime @default(now())
     
     opportunity       Opportunity      @relation(fields: [opportunityId], references: [id])
     clientCompany     ClientCompany    @relation(fields: [clientCompanyId], references: [id])
     sectionLinks      SectionEvidenceLink[]
   }
   
   model SectionEvidenceLink {
     id                String   @id @default(uuid())
     sectionId         String
     artifactId        String
     relevanceScore    Float    @default(0.8)
     quotedText        String?  // Snippet of section text this addresses
   }
   ```

2. **Create evidence routes:**
   - POST `/api/opportunities/:id/evidence` (upload or link evidence)
   - GET `/api/opportunities/:id/evidence` (list for opportunity)
   - POST `/api/opportunities/:id/evidence/search` (find relevant evidence for claim)

3. **Enhance proposal section editing:**
   - Show linked evidence in side-by-side panel
   - Allow editor to drag-drop evidence or paste quotes
   - Track evidence citations in draft

---

#### Priority 1D: Submission Readiness Validator (1 week)
**Goal:** Final gate before proposal export

**What to build:**
1. **Create readiness check service:**
   - Verify all requirements are covered (coverage threshold: > 90%)
   - Verify all mandatory fields have evidence
   - Check page limits vs. actual draft length
   - Detect unfounded claims (section text without evidence links)
   - Verify compliance with evaluation factors

2. **New routes:**
   - POST `/api/opportunities/:id/check-readiness` → returns Ready / Not Ready + blockers
   - POST `/api/opportunities/:id/export-proposal` → PDF export if ready or override logged

3. **Frontend readiness dashboard:**
   - Show coverage % by requirement
   - Red flag blocking issues
   - List all override decisions with justification

---

### Release 1 Success Metrics (Revised)

- ✅ Upload RFP → Extract requirements → Map sections → Add evidence → Export proposal in < 30 minutes
- ✅ 95%+ requirement accuracy from extraction
- ✅ Zero requirements missed in export checklist
- ✅ 100% of proposal sections mapped to requirements
- ✅ All claims linked to evidence with confidence scores

---

## PART 4: CORRECTED SCHEMA EXTENSIONS

**Instead of creating new `Solicitation` entity, enhance existing:**

```prisma
// EXTEND: OpportunityDocument
model OpportunityDocument {
  // ... existing fields ...
  
  // Requirement extraction metadata
  requirementExtractionStatus   String    @default("PENDING")  // PENDING, EXTRACTING, EXTRACTED, FAILED
  extractedRequirementCount     Int       @default(0)
  extractionConfidence          Float?    // 0-1: overall confidence
  extractionErrorMsg            String?
  extractedAt                   DateTime?
  
  // Link requirements back to their source documents
  sourceOfRequirements          MatrixRequirement[] @relation("SourceDocument")
}

// EXTEND: MatrixRequirement
model MatrixRequirement {
  // ... existing fields ...
  
  // Source tracking
  sourceDocumentId              String?
  sourcePageNumber              Int?
  extractionConfidence          Float    @default(0.8)
  isManuallyVerified            Boolean  @default(false)
  manualOverrideReason          String?
  
  sourceDocument                OpportunityDocument? @relation("SourceDocument", fields: [sourceDocumentId], references: [id])
  
  // Proposal coverage
  proposalSectionId             String?
  coverageStatus                String   @default("UNCOVERED")
  coverageScore                 Float    @default(0)
  
  proposalSection               ProposalSection? @relation(fields: [proposalSectionId], references: [id])
}

// NEW: ProposalSection
model ProposalSection {
  id                String   @id @default(uuid())
  opportunityId     String
  title             String
  description       String?
  pageLimit         Int?
  
  // Draft management
  draft             String?  // Rich text
  draftVersion      Int      @default(0)
  lastEditedAt      DateTime?
  lastEditedBy      String?  // User ID
  
  // Coverage tracking
  coverageStatus    String   @default("UNCOVERED")  // UNCOVERED, PARTIAL, COVERED
  coverageScore     Float    @default(0)  // 0-1 aggregate
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  opportunity       Opportunity         @relation(fields: [opportunityId], references: [id])
  requirements      MatrixRequirement[]
  evidenceLinks     SectionEvidenceLink[]
}

// NEW: EvidenceArtifact
model EvidenceArtifact {
  id                String   @id @default(uuid())
  opportunityId     String
  clientCompanyId   String?
  
  title             String
  description       String?
  type              String   // CASE_STUDY, PAST_PERF, CERTIFICATION, WHITEPAPER, etc.
  
  // Storage
  s3Key             String?  // If file-based
  sourceUrl         String?  // If external
  content           String?  // If text-based
  
  // Relevance
  relevantNaics     String[] @default([])
  relevantAgencies  String[] @default([])
  relevanceScore    Float    @default(0)  // Auto-calculated
  
  createdAt         DateTime @default(now())
  
  opportunity       Opportunity       @relation(fields: [opportunityId], references: [id])
  clientCompany     ClientCompany?    @relation(fields: [clientCompanyId], references: [id])
  sectionLinks      SectionEvidenceLink[]
}

// NEW: SectionEvidenceLink
model SectionEvidenceLink {
  id                String   @id @default(uuid())
  sectionId         String
  artifactId        String
  
  relevanceScore    Float    @default(0.8)
  quotedText        String?  // Snippet this addresses
  
  proposalSection   ProposalSection @relation(fields: [sectionId], references: [id])
  artifact          EvidenceArtifact @relation(fields: [artifactId], references: [id])
  
  @@unique([sectionId, artifactId])
}

// EXTEND: Opportunity
model Opportunity {
  // ... existing fields ...
  
  // Proposal workspace
  proposalSections    ProposalSection[]
  evidenceArtifacts   EvidenceArtifact[]
  
  // Submission readiness
  isReadyForSubmission Boolean  @default(false)
  readinessCheckAt    DateTime?
  readinessBlockers   Json?    // Array of blocking issues
}
```

---

## PART 5: IMPLEMENTATION SEQUENCE (Revised)

### Week 1: Requirements Extraction
1. Extend OpportunityDocument schema
2. Extend MatrixRequirement with source tracking
3. Create DocumentRequirementExtractor service
4. Create parsing worker
5. Enhance compliance matrix routes with source filtering

### Week 2: Requirement-Section Mapping
1. Create ProposalSection schema
2. Extend generateProposalOutline to create sections + link to requirements
3. Create proposal section routes
4. Build section edit UI with coverage indicator

### Week 3: Evidence Management
1. Create EvidenceArtifact schema
2. Create evidence upload/search routes
3. Build evidence side-by-side panel in section editor
4. Implement evidence search (Claude-powered semantic search)

### Week 4: Submission Readiness
1. Create readiness validator service
2. Add readiness check routes
3. Build readiness dashboard
4. Implement export with override logging

---

## PART 6: WHAT TO CHANGE IN CLAUDE.MD

### Remove:
- ❌ "Module D: Solicitation Intelligence" framing
- ❌ Proposed separate `Solicitation` model
- ❌ New `/api/solicitations/*` routes
- ❌ Phase 1A-E structure for solicitation module

### Add/Update:
- ✅ Leverage existing `Opportunity` and `ComplianceMatrix` architecture
- ✅ Extend `OpportunityDocument` for requirement extraction
- ✅ Use existing multi-LLM router (don't call Claude directly)
- ✅ Follow existing worker pattern (workers, not sync parsing)
- ✅ Extend existing routes (`/api/opportunities/:id/*` and `/api/compliance-matrix/*`)
- ✅ Acknowledge existing proposal assist system (enhance, don't replace)

---

## SUMMARY OF CORRECTIONS

| Item | Originally Proposed | Corrected Approach |
|------|-------------------|-------------------|
| Solicitation vs. Opportunity | Create new Solicitation entity | Extend existing Opportunity |
| ComplianceMatrix role | Replace with new model | Enhance existing matrix |
| Requirement extraction | New SolicitationParser service | Enhance DocumentAnalysisService |
| Parsing pattern | Synchronous in route | Async worker (existing pattern) |
| Evidence artifacts | New EvidenceArtifact | Extend ClientDocument or new entity |
| API routes | New `/api/solicitations/*` | Extend `/api/opportunities/:id/*` |
| LLM calls | Direct Claude API | Use existing llmRouter |
| Token tracking | Mentioned but not detailed | Already fully implemented (use existing) |

---

## RECOMMENDATION

**Proceed with Phase 1 implementation BUT:**

1. **Update CLAUDE.md** to reflect opportunity-centric model
2. **Don't create new Solicitation/SolicitationDocument entities** — use Opportunity/OpportunityDocument
3. **Don't create new Parser service** — enhance DocumentAnalysisService
4. **Use existing llmRouter** for all Claude calls
5. **Follow existing worker pattern** for parsing jobs
6. **Extend existing routes** rather than create new route namespaces

**Timeline:** 4 weeks (same estimate) but higher confidence due to leveraging existing patterns.

---

**Status:** ✅ Ready to Implement Phase 1A-1D with corrections
