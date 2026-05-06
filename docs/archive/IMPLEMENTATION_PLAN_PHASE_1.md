# Phase 1 Implementation Plan — Corrected Approach

**Status:** Ready to Implement  
**Timeline:** 4 weeks  
**Approach:** Leverage existing architecture (Opportunity-centric, ComplianceMatrix, llmRouter, workers)

---

## PART 1: PHASE 1A — REQUIREMENT EXTRACTION (Week 1-2)

### Objective
Enable automatic extraction of must/should requirements from uploaded RFP documents, with source document linking and manual override capability.

### What to Build

#### 1A.1 Schema Enhancement

Add to `backend/prisma/schema.prisma`:

```prisma
// EXTEND: OpportunityDocument
model OpportunityDocument {
  id                            String   @id @default(cuid())
  opportunityId                 String
  fileName                      String
  fileType                      String
  fileSize                      Int
  storageKey                    String
  fileUrl                       String?
  isAmendment                   Boolean  @default(false)
  uploadedAt                    DateTime @default(now())
  
  // EXISTING: analysisStatus, scopeKeywords, complexityScore, etc.
  analysisStatus                String    @default("PENDING")
  analysisError                 String?
  scopeKeywords                 String[]
  complexityScore               Float?
  alignmentScore                Float?
  incumbentSignals              String[]
  rawAnalysis                   Json?
  analyzedAt                    DateTime?
  
  // NEW: Requirement extraction fields
  extractionStatus              String    @default("PENDING")  // PENDING, EXTRACTING, EXTRACTED, FAILED
  extractedRequirementCount     Int       @default(0)
  extractionConfidence          Float?    // 0-1: overall confidence in extraction
  extractionError               String?
  extractedAt                   DateTime?
  
  createdAt                     DateTime  @default(now())
  updatedAt                     DateTime  @updatedAt

  // Relations
  opportunity                   Opportunity         @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  extractedRequirements         MatrixRequirement[] @relation("SourceDocument")

  @@index([opportunityId])
  @@index([extractionStatus])
  @@map("opportunity_documents")
}

// EXTEND: MatrixRequirement
model MatrixRequirement {
  id                            String  @id @default(cuid())
  matrixId                      String
  section                       String
  sectionType                   String  @default("INSTRUCTION")  // INSTRUCTION, EVALUATION, TIMING, FORMAT, etc.
  requirementText               String
  proposalSection               String?
  status                        String  @default("NOT_STARTED")  // NOT_STARTED, IN_PROGRESS, ADDRESSED, COVERED
  notes                         String?
  isMandatory                   Boolean @default(true)
  farReference                  String?
  sortOrder                     Int     @default(0)
  
  // NEW: Source document tracking
  sourceDocumentId              String?   // Which document this requirement was extracted from
  sourcePageNumber              Int?      // Which page (if known)
  extractionMethod              String    @default("AI")  // AI, MANUAL, HYBRID
  extractionConfidence          Float     @default(0.8)  // 0-1 scale
  isManuallyVerified            Boolean   @default(false)
  manualOverrideReason          String?   // Why the requirement was manually overridden
  
  // NEW: Proposal coverage tracking
  proposalSectionId             String?   // Linked proposal section (when built)
  coverageStatus                String    @default("UNCOVERED")  // UNCOVERED, PARTIAL, COVERED
  coverageScore                 Float     @default(0)  // 0-1: how well addressed
  
  createdAt                     DateTime  @default(now())
  updatedAt                     DateTime  @updatedAt

  // Relations
  matrix                        ComplianceMatrix      @relation(fields: [matrixId], references: [id], onDelete: Cascade)
  sourceDocument                OpportunityDocument? @relation("SourceDocument", fields: [sourceDocumentId], references: [id], onDelete: SetNull)
  
  @@map("matrix_requirements")
}
```

**Migration:**
```bash
npx prisma migrate dev --name enhance_requirement_extraction
```

---

#### 1A.2 Requirement Extraction Service

Create `backend/src/services/requirementExtractor.ts`:

```typescript
import pdfParse from 'pdf-parse';
import { generateWithRouter } from './llm/llmRouter';
import { logger } from '../utils/logger';

export interface ExtractedRequirement {
  statement: string;
  type: 'MUST' | 'SHOULD' | 'MAY' | 'REQUIRED' | 'INSTRUCTION' | 'EVALUATION';
  section: string;
  subsection?: string;
  isMandatory: boolean;
  confidence: number;  // 0-1
  pageNumber?: number;
}

export interface ExtractionResult {
  requirements: ExtractedRequirement[];
  totalPageCount: number;
  extractionConfidence: number;  // 0-1 overall
  ambiguities: string[];
}

/**
 * Extract structured requirements from RFP PDF buffer.
 * Uses Claude via llmRouter to ensure firm's preferred LLM is used.
 */
export async function extractRequirementsFromPDF(
  pdfBuffer: Buffer,
  consultingFirmId: string,
  chunkSize: number = 50000
): Promise<ExtractionResult> {
  try {
    // 1. Parse PDF to text
    const pdfData = await pdfParse(pdfBuffer);
    const fullText = pdfData.text;
    const pageCount = pdfData.numpages || 0;
    
    logger.info('PDF parsed', { pages: pageCount, size: fullText.length, firm: consultingFirmId });

    // 2. Split into chunks (stay under token limits)
    const chunks: string[] = [];
    for (let i = 0; i < fullText.length; i += chunkSize) {
      chunks.push(fullText.substring(i, i + chunkSize));
    }

    // 3. Extract requirements from each chunk using Claude
    const allRequirements: ExtractedRequirement[] = [];
    const ambiguities: string[] = [];

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const isFirstChunk = chunkIdx === 0;
      const isLastChunk = chunkIdx === chunks.length - 1;

      const systemPrompt = `You are analyzing a government RFP/RFQ document. Extract ALL explicit requirements, instructions, and evaluation criteria. Output valid JSON only — no explanation.

Return an object with:
- "requirements": array of requirement objects
- "ambiguities": array of unclear/contradictory statements found`;

      const userPrompt = `Extract requirements from this ${isFirstChunk ? 'BEGINNING' : isLastChunk ? 'END' : 'MIDDLE'} section of an RFP.

${chunk}

Return JSON:
{
  "requirements": [
    {
      "statement": "Exact requirement text",
      "type": "MUST|SHOULD|MAY|REQUIRED|INSTRUCTION|EVALUATION",
      "section": "Section reference if visible (e.g., '3.1.2')",
      "isMandatory": true,
      "confidence": 0.95
    }
  ],
  "ambiguities": ["Any unclear or contradictory statements"]
}`;

      try {
        const response = await generateWithRouter(
          {
            systemPrompt,
            userPrompt,
            maxTokens: 3000,
            temperature: 0.2,  // Low temperature for consistency
          },
          consultingFirmId,
          { task: 'REQUIREMENT_EXTRACTION', useCache: false }
        );

        // Parse response JSON
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          logger.warn('No JSON found in chunk response', { chunk: chunkIdx });
          continue;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.requirements) {
          allRequirements.push(...parsed.requirements);
        }
        if (parsed.ambiguities) {
          ambiguities.push(...parsed.ambiguities);
        }
      } catch (err) {
        logger.error('Chunk extraction failed', { chunk: chunkIdx, error: String(err) });
        // Continue with other chunks on failure
      }
    }

    // 4. De-duplicate and score confidence
    const uniqueRequirements = deduplicateRequirements(allRequirements);
    const overallConfidence = uniqueRequirements.length > 0
      ? uniqueRequirements.reduce((sum, r) => sum + r.confidence, 0) / uniqueRequirements.length
      : 0;

    logger.info('Requirements extracted', {
      count: uniqueRequirements.length,
      confidence: overallConfidence.toFixed(2),
      firm: consultingFirmId,
    });

    return {
      requirements: uniqueRequirements,
      totalPageCount: pageCount,
      extractionConfidence: overallConfidence,
      ambiguities,
    };
  } catch (error) {
    logger.error('Requirement extraction failed', { error: String(error) });
    throw new Error(`Requirement extraction failed: ${String(error)}`);
  }
}

/**
 * Remove duplicate or near-duplicate requirements.
 * Use simple heuristic: same first 100 chars likely duplicate.
 */
function deduplicateRequirements(reqs: ExtractedRequirement[]): ExtractedRequirement[] {
  const seen = new Set<string>();
  return reqs.filter(req => {
    const key = req.statement.substring(0, 100).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

---

#### 1A.3 Parsing Worker Job

Create `backend/src/workers/requirementExtractionWorker.ts`:

```typescript
import { Worker, Queue, Job } from 'bullmq';
import { prisma } from '../config/database';
import { downloadFromS3 } from '../services/fileStorage';  // Assuming S3 util exists
import { extractRequirementsFromPDF } from '../services/requirementExtractor';
import { logger } from '../utils/logger';
import { config } from '../config/config';

const redisConnection = {
  url: config.redis.url,
};

const requirementExtractionQueue = new Queue('requirement-extraction', { connection: redisConnection });

/**
 * Queue a document for requirement extraction.
 */
export async function queueRequirementExtraction(documentId: string): Promise<void> {
  await requirementExtractionQueue.add(
    'extract',
    { documentId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    }
  );
}

/**
 * Worker: Process requirement extraction jobs
 */
export function startRequirementExtractionWorker(): Worker {
  const worker = new Worker('requirement-extraction', async (job: Job) => {
    const { documentId } = job.data;

    logger.info('Processing requirement extraction', { documentId, jobId: job.id });

    try {
      // 1. Fetch document record
      const document = await prisma.opportunityDocument.findUnique({
        where: { id: documentId },
        include: { opportunity: { include: { consultingFirm: true } } },
      });

      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // 2. Mark as extracting
      await prisma.opportunityDocument.update({
        where: { id: documentId },
        data: { extractionStatus: 'EXTRACTING' },
      });

      // 3. Download file from S3 (assuming storageKey is S3 path)
      let pdfBuffer: Buffer;
      if (document.storageKey.startsWith('s3://')) {
        // Download from S3
        const s3Key = document.storageKey.replace('s3://', '');
        pdfBuffer = await downloadFromS3(s3Key);
      } else {
        throw new Error(`Unknown storage type: ${document.storageKey}`);
      }

      // 4. Extract requirements
      const result = await extractRequirementsFromPDF(
        pdfBuffer,
        document.opportunity.consultingFirmId
      );

      // 5. Get or create ComplianceMatrix for this opportunity
      let matrix = await prisma.complianceMatrix.findUnique({
        where: { opportunityId: document.opportunityId },
      });

      if (!matrix) {
        matrix = await prisma.complianceMatrix.create({
          data: {
            opportunityId: document.opportunityId,
            consultingFirmId: document.opportunity.consultingFirmId,
          },
        });
      }

      // 6. Create MatrixRequirements with source document linking
      const created = await Promise.all(
        result.requirements.map(req =>
          prisma.matrixRequirement.create({
            data: {
              matrixId: matrix.id,
              section: req.section || `Section ${result.requirements.indexOf(req) + 1}`,
              sectionType: req.type === 'EVALUATION' ? 'EVALUATION' : 'INSTRUCTION',
              requirementText: req.statement,
              isMandatory: req.isMandatory,
              sourceDocumentId: documentId,
              sourcePageNumber: req.pageNumber,
              extractionMethod: 'AI',
              extractionConfidence: req.confidence,
            },
          })
        )
      );

      // 7. Update document with extraction status
      await prisma.opportunityDocument.update({
        where: { id: documentId },
        data: {
          extractionStatus: 'EXTRACTED',
          extractedRequirementCount: created.length,
          extractionConfidence: result.extractionConfidence,
          extractedAt: new Date(),
        },
      });

      logger.info('Requirement extraction completed', {
        documentId,
        requirementCount: created.length,
        confidence: result.extractionConfidence.toFixed(2),
      });

      return { success: true, requirementCount: created.length };
    } catch (error) {
      logger.error('Requirement extraction failed', { documentId, error: String(error) });

      // Update document with error
      await prisma.opportunityDocument.update({
        where: { id: documentId },
        data: {
          extractionStatus: 'FAILED',
          analysisError: String(error),
        },
      });

      throw error;  // Let BullMQ retry
    }
  }, { connection: redisConnection });

  worker.on('completed', (job) => {
    logger.info('Job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed after retries', { jobId: job?.id, error: String(err) });
  });

  return worker;
}

export { requirementExtractionQueue };
```

Update `backend/src/server.ts` to start the worker:

```typescript
import { startRequirementExtractionWorker } from './workers/requirementExtractionWorker';

async function bootstrap(): Promise<void> {
  // ... existing code ...

  // Start workers
  startScoringWorker();
  startEnrichmentWorker();
  startRecalibrationWorker();
  startRequirementExtractionWorker();  // ADD THIS
  
  // ... rest of code ...
}
```

---

#### 1A.4 Document Upload Enhancement

Update `backend/src/routes/documents.ts` to trigger extraction when document uploaded:

```typescript
// Existing route that handles file upload
router.post('/:opportunityId/upload', upload.single('document'), async (req, res) => {
  // ... existing upload logic ...
  
  // After successfully creating OpportunityDocument:
  const { queueRequirementExtraction } = await import('../workers/requirementExtractionWorker');
  await queueRequirementExtraction(createdDocument.id);
  
  res.json({ success: true, document: createdDocument, message: 'Extraction queued' });
});
```

---

#### 1A.5 Compliance Matrix Routes Enhancement

Add to `backend/src/routes/complianceMatrix.ts`:

```typescript
// GET: Fetch requirements with optional source document filter
router.get('/:opportunityId/requirements', authenticateJWT, enforceTenantScope, async (req, res) => {
  try {
    const { opportunityId } = req.params;
    const { sourceDocumentId } = req.query;  // Optional filter

    const matrix = await prisma.complianceMatrix.findUnique({
      where: { opportunityId },
      include: {
        requirements: {
          where: sourceDocumentId ? { sourceDocumentId: String(sourceDocumentId) } : undefined,
          include: { sourceDocument: { select: { id: true, fileName: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!matrix) {
      return res.status(404).json({ error: 'Compliance matrix not found' });
    }

    res.json(matrix.requirements);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// PATCH: Override requirement with reason tracking
router.patch(
  '/:opportunityId/requirements/:requirementId',
  authenticateJWT,
  enforceTenantScope,
  async (req, res) => {
    try {
      const { opportunityId, requirementId } = req.params;
      const { requirementText, isMandatory, overrideReason } = req.body;
      const userId = (req as any).user?.id;

      const updated = await prisma.matrixRequirement.update({
        where: { id: requirementId },
        data: {
          requirementText: requirementText ?? undefined,
          isMandatory: isMandatory ?? undefined,
          isManuallyVerified: true,
          manualOverrideReason: overrideReason,
        },
      });

      // Log audit event
      logger.info('Requirement manually overridden', {
        requirementId,
        opportunityId,
        overrideReason,
        userId,
      });

      res.json({ success: true, requirement: updated });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  }
);

// POST: Re-extract requirements from all documents
router.post('/:opportunityId/refresh', authenticateJWT, enforceTenantScope, async (req, res) => {
  try {
    const { opportunityId } = req.params;

    const documents = await prisma.opportunityDocument.findMany({
      where: { opportunityId },
    });

    const { queueRequirementExtraction } = await import('../workers/requirementExtractionWorker');
    for (const doc of documents) {
      await queueRequirementExtraction(doc.id);
    }

    res.json({
      success: true,
      message: `Queued ${documents.length} documents for re-extraction`,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});
```

---

### 1A.6 Frontend: Requirement Extraction Status UI

Create `frontend/src/components/RequirementExtractionStatus.tsx`:

```typescript
import React, { useEffect, useState } from 'react';

interface Document {
  id: string;
  fileName: string;
  extractionStatus: 'PENDING' | 'EXTRACTING' | 'EXTRACTED' | 'FAILED';
  extractedRequirementCount: number;
  extractionConfidence?: number;
  analysisError?: string;
}

export function RequirementExtractionStatus({ opportunityId }: { opportunityId: string }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [pollingActive, setPollingActive] = useState(false);

  useEffect(() => {
    fetchDocuments();
    const interval = setInterval(fetchDocuments, 3000);  // Poll every 3s
    return () => clearInterval(interval);
  }, [opportunityId]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/documents`);
      const data = await res.json();
      setDocuments(data);
      
      // Stop polling if all documents are done
      const anyProcessing = data.some((d: Document) => d.extractionStatus === 'EXTRACTING');
      setPollingActive(anyProcessing);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading documents...</div>;

  return (
    <div className="p-6 border rounded">
      <h3 className="text-lg font-bold mb-4">RFP Documents & Requirement Extraction</h3>
      
      {documents.length === 0 ? (
        <p className="text-gray-600">No documents uploaded yet</p>
      ) : (
        <div className="space-y-3">
          {documents.map(doc => (
            <div key={doc.id} className="p-3 border rounded bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{doc.fileName}</p>
                  <p className="text-sm text-gray-600">
                    Status: {doc.extractionStatus}
                    {doc.extractionStatus === 'EXTRACTED' && (
                      ` — ${doc.extractedRequirementCount} requirements extracted`
                    )}
                  </p>
                </div>
                <div>
                  {doc.extractionStatus === 'EXTRACTING' && (
                    <div className="animate-spin h-4 w-4 border-2 border-blue-600 rounded-full"></div>
                  )}
                  {doc.extractionStatus === 'EXTRACTED' && (
                    <span className="text-green-600 font-bold">✓</span>
                  )}
                  {doc.extractionStatus === 'FAILED' && (
                    <span className="text-red-600">✗</span>
                  )}
                </div>
              </div>
              
              {doc.analysisError && (
                <p className="text-xs text-red-600 mt-2">{doc.analysisError}</p>
              )}
              
              {doc.extractionConfidence && (
                <p className="text-xs text-gray-500 mt-2">
                  Confidence: {(doc.extractionConfidence * 100).toFixed(0)}%
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### 1A.7 Testing the Implementation

**Test steps:**
1. Upload an RFP PDF to an opportunity
2. Verify document record created with `extractionStatus: 'PENDING'`
3. Wait for worker to process (check logs)
4. Verify document updated with `extractionStatus: 'EXTRACTED'`
5. Verify MatrixRequirements created with source document ID
6. GET `/api/compliance-matrix/:id/requirements` to see extracted requirements
7. PATCH a requirement with override reason
8. Verify audit log entry created

---

## PART 2: PHASE 1B — PROPOSAL SECTIONS & REQUIREMENT MAPPING (Week 2-3)

**Objective:** Create proposal sections and auto-map them to extracted requirements.

### Key Changes:
1. Add `ProposalSection` schema entity
2. Enhance `generateProposalOutline` to create sections + link requirements
3. Build `/api/opportunities/:id/proposal-sections` routes
4. Frontend to display sections with requirement coverage

**Duration:** ~5 days
**Dependencies:** Phase 1A complete

---

## PART 3: PHASE 1C — EVIDENCE ARTIFACTS (Week 3-4)

**Objective:** Store and link evidence to proposal sections.

### Key Changes:
1. Add `EvidenceArtifact` + `SectionEvidenceLink` schema
2. Create evidence upload/search routes
3. Build evidence panel in section editor
4. Implement semantic search (Claude-powered)

**Duration:** ~5 days
**Dependencies:** Phase 1B complete

---

## PART 4: PHASE 1D — SUBMISSION READINESS (Week 4)

**Objective:** Final compliance gate + export.

### Key Changes:
1. Create readiness validator service
2. Add validation routes
3. Build readiness dashboard
4. Implement export with override logging

**Duration:** ~3 days
**Dependencies:** Phases 1A-1C complete

---

## NEXT STEPS

1. **Review this plan** with the team
2. **Confirm S3 integration** is already set up (check config/uploads)
3. **Verify downloadFromS3 utility** exists or create it
4. **Start with 1A.1 (schema extension)**
5. **Test locally** before merging

**Estimated Total Effort:** 4 weeks, 1 senior backend engineer + 1 frontend engineer

---

## SUCCESS METRICS

- ✅ Upload RFP → Extract requirements → View matrix in < 2 minutes
- ✅ 95%+ requirement capture accuracy
- ✅ All requirements source-linked to document + page
- ✅ Manual override reason tracked for compliance
- ✅ End-to-end test: RFP → Proposal → Export in < 30 minutes
