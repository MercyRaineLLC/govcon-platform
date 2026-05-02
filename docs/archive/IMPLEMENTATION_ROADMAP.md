# GovCon Platform — Implementation Roadmap

## Overview
This document provides detailed implementation guidance for closing gaps identified in CLAUDE.md. Focus is on the highest-impact, fastest-to-value work needed to complete Release 1 (Solicitation to Proposal).

---

## PART 1: SOLICITATION INTELLIGENCE MODULE (Module D) — CRITICAL GAP

### Why This First?
The entire proposal workflow depends on having **structured, extracted requirements**. Without this, proposals remain disconnected from what the RFP actually asks for.

### Implementation Phases

#### Phase 1A: Database Schema Extension (2-3 days)

**Add to `backend/prisma/schema.prisma`:**

```prisma
//////////////////////////////////////////////////////////////
// SOLICITATION MANAGEMENT
//////////////////////////////////////////////////////////////

model Solicitation {
  id                 String   @id @default(uuid())
  consultingFirmId   String
  opportunityId      String   @unique
  title              String
  agency             String
  subagency          String?
  office             String?
  
  // RFP metadata
  solicitationType   String   @default("RFP")  // RFP, RFQ, RFI, etc.
  documentCount      Int      @default(0)
  totalPages         Int?
  pdfSize            Int?
  
  // Parsing metadata
  parseStatus        String   @default("PENDING")  // PENDING, PARSING, PARSED, FAILED
  parseErrorMsg      String?
  lastParsedAt       DateTime?
  parseConfidence    Float?   @default(0)  // 0-1 scale
  
  // Parsed constraints
  pageLimit          Int?
  fontRule           String?  // e.g., "12pt minimum"
  responseDeadline   DateTime
  submissionMethod   String?  // EMAIL, PORTAL, SAM.GOV, etc.
  
  // Tracking
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  consultingFirm     ConsultingFirm     @relation(fields: [consultingFirmId], references: [id], onDelete: Cascade)
  opportunity        Opportunity        @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  documents          SolicitationDocument[]
  requirements       Requirement[]
  evaluationFactors  EvaluationFactor[]
  amendments         SolicitationAmendment[]
  proposals          Proposal[]
  ambiguityFlags     AmbiguityFlag[]

  @@index([consultingFirmId])
  @@index([opportunityId])
  @@index([parseStatus])
  @@map("solicitations")
}

model SolicitationDocument {
  id              String   @id @default(uuid())
  solicitationId  String
  filename        String
  s3Key           String   // S3 object key
  documentType    String   // RFP, AMENDMENT, EXHIBIT, ATTACHMENT, etc.
  pageCount       Int?
  sizeBytes       Int
  uploadedAt      DateTime @default(now())
  
  // OCR / parsing metadata
  isOcr           Boolean  @default(false)
  ocrConfidence   Float?
  
  // Linking to extracted requirements
  requirementIds  String[] @default([])  // json array of requirement IDs from this doc

  solicitation    Solicitation @relation(fields: [solicitationId], references: [id], onDelete: Cascade)
  pageExtracts    PageExtract[]

  @@index([solicitationId])
  @@map("solicitation_documents")
}

model PageExtract {
  id               String   @id @default(uuid())
  solicitationDocumentId String
  pageNumber       Int
  rawText          String   // Raw OCR or extracted text
  cleanText        String?  // Cleaned/normalized text
  extractedAt      DateTime @default(now())

  document         SolicitationDocument @relation(fields: [solicitationDocumentId], references: [id], onDelete: Cascade)

  @@index([solicitationDocumentId])
  @@map("page_extracts")
}

model Requirement {
  id               String   @id @default(uuid())
  solicitationId   String
  
  // Requirement text and metadata
  statement        String   // The actual requirement text
  requirementType  String   @default("MUST")  // MUST, SHOULD, MAY, REQUIRED, etc.
  section          String?  // e.g., "Section 3.1.2"
  subsection       String?  // Hierarchical breakdown
  
  // Source tracking
  sourceDocumentId String?
  sourcePageNumber Int?
  sourceSection    String?
  sourceText       String?  // Quoted source text
  
  // Extraction confidence and overrides
  extractionMethod String   @default("AI")  // AI, MANUAL, HYBRID
  extractionConfidence Float  @default(0.8)  // 0-1 scale
  isManuallyOverridden Boolean @default(false)
  overrideReason   String?
  overriddenBy     String?  // User ID
  
  // Compliance tracking
  isMandatory      Boolean  @default(true)
  isEvaluationFactor Boolean @default(false)
  relatedEvalFactors String[] @default([])  // IDs of related evaluation factors
  
  // Section coverage
  proposalSectionId String?
  coverageStatus   String   @default("UNCOVERED")  // UNCOVERED, PARTIAL, COVERED
  adherenceScore   Float?   // 0-1 scale, how well it's addressed
  
  // Amendments and updates
  supersededBy     String?  // ID of requirement that replaces this (via amendment)
  isActive         Boolean  @default(true)
  
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  solicitation     Solicitation    @relation(fields: [solicitationId], references: [id], onDelete: Cascade)
  sourceDocument   SolicitationDocument? @relation(fields: [sourceDocumentId], references: [id])
  proposalSection  ProposalSection? @relation(fields: [proposalSectionId], references: [id])

  @@index([solicitationId])
  @@index([isActive])
  @@index([coverageStatus])
  @@map("requirements")
}

model EvaluationFactor {
  id               String   @id @default(uuid())
  solicitationId   String
  
  // Factor definition
  factorName       String   // e.g., "Technical Approach"
  description      String?
  weight           Float?   // Relative weight as percentage
  pointsPossible   Int?
  
  // Source tracking
  sourceDocumentId String?
  sourcePageNumber Int?
  sourceSection    String?
  sourceText       String?
  
  // Extraction metadata
  extractionConfidence Float  @default(0.8)
  isManuallySet    Boolean  @default(false)
  
  // Linked requirements
  linkedRequirementIds String[] @default([])  // Requirements that feed this evaluation
  
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  solicitation     Solicitation         @relation(fields: [solicitationId], references: [id], onDelete: Cascade)
  sourceDocument   SolicitationDocument? @relation(fields: [sourceDocumentId], references: [id])

  @@index([solicitationId])
  @@map("evaluation_factors")
}

model SolicitationAmendment {
  id               String   @id @default(uuid())
  solicitationId   String
  
  amendmentNumber  Int
  postedDate       DateTime
  description      String?
  
  // Changes
  affectedSections String[]  @default([])  // Section numbers changed
  affectedRequirements String[] @default([])  // Requirement IDs affected
  deltaDescription String?   // Summary of what changed
  
  // Tracking
  documentId       String?  // S3 key for amendment document
  createdAt        DateTime @default(now())

  solicitation     Solicitation @relation(fields: [solicitationId], references: [id], onDelete: Cascade)

  @@index([solicitationId])
  @@map("solicitation_amendments")
}

model AmbiguityFlag {
  id               String   @id @default(uuid())
  solicitationId   String
  
  flagType         String   // CONTRADICTION, UNRESOLVED_REF, AMBIGUOUS_TERM, MISSING_INFO
  severity         String   @default("MEDIUM")  // LOW, MEDIUM, HIGH, CRITICAL
  description      String
  affectedAreas    String[] @default([])  // Sections, requirement IDs, etc.
  suggestedResolution String?
  isResolved       Boolean  @default(false)
  
  createdAt        DateTime @default(now())

  solicitation     Solicitation @relation(fields: [solicitationId], references: [id], onDelete: Cascade)

  @@index([solicitationId])
  @@index([isResolved])
  @@map("ambiguity_flags")
}
```

**Migration Command:**
```bash
npx prisma migrate dev --name add_solicitation_module
```

---

#### Phase 1B: File Storage Integration (2-3 days)

**Create `backend/src/services/fileStorage.ts`:**

```typescript
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

export async function uploadToS3(
  buffer: Buffer,
  filename: string,
  folder: string = 'solicitations'
): Promise<string> {
  const key = `${folder}/${uuidv4()}-${filename}`;
  
  await s3.putObject({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: 'application/pdf',
  }).promise();
  
  return key;
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  const obj = await s3.getObject({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
  }).promise();
  
  return obj.Body as Buffer;
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3.deleteObject({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
  }).promise();
}
```

**Add to `backend/.env.example`:**
```
AWS_S3_BUCKET=govcon-solicitations
AWS_ACCESS_KEY_ID=<your-aws-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret>
AWS_REGION=us-east-1
```

---

#### Phase 1C: Document Parsing Pipeline (4-5 days)

**Create `backend/src/services/solicitationParser.ts`:**

```typescript
import pdfParse from 'pdf-parse';
import { Anthropic } from '@anthropic-ai/sdk';
import { db } from '../config/database';

const anthropic = new Anthropic();

export async function parseRFPDocument(
  fileBuffer: Buffer,
  solicitationId: string,
  documentId: string
): Promise<{
  requirements: string[];
  evaluationFactors: string[];
  ambiguities: string[];
  metadata: Record<string, any>;
}> {
  
  // 1. Extract text from PDF
  const pdfData = await pdfParse(fileBuffer);
  const fullText = pdfData.text;
  const pageCount = pdfData.numpages;
  
  // 2. Split into pages and store extracts
  const pages = fullText.split('\n\n');
  for (let i = 0; i < pages.length; i++) {
    await db.pageExtract.create({
      data: {
        solicitationDocumentId: documentId,
        pageNumber: i + 1,
        rawText: pages[i],
        cleanText: pages[i].replace(/\s+/g, ' ').trim(),
      },
    });
  }
  
  // 3. Use Claude to extract structured requirements
  const extractionPrompt = `You are analyzing a government RFP/RFQ. Extract the following in JSON format:

{
  "requirements": [
    {
      "statement": "Exact requirement text",
      "type": "MUST|SHOULD|MAY|REQUIRED",
      "section": "Section reference if available",
      "isMandatory": true,
      "confidence": 0.95
    }
  ],
  "evaluationFactors": [
    {
      "name": "Factor name",
      "description": "Brief description",
      "weight": 25,
      "confidence": 0.90
    }
  ],
  "ambiguities": [
    {
      "type": "CONTRADICTION|UNRESOLVED_REF|AMBIGUOUS_TERM|MISSING_INFO",
      "description": "What is unclear",
      "severity": "LOW|MEDIUM|HIGH|CRITICAL",
      "affectedSections": ["3.1", "3.2"]
    }
  ],
  "metadata": {
    "pageLimit": null,
    "fontRule": "12pt minimum",
    "responseFormat": "Electronic submission",
    "submissionMethod": "Email to..."
  }
}

RFP TEXT:
${fullText.substring(0, 50000)}  // First 50k chars to stay within token limits
`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: extractionPrompt,
      },
    ],
  });

  const extractedText = response.content[0].type === 'text' ? response.content[0].text : '';
  const extracted = JSON.parse(extractedText);

  // 4. Store extracted requirements
  for (const req of extracted.requirements) {
    await db.requirement.create({
      data: {
        solicitationId,
        statement: req.statement,
        requirementType: req.type,
        section: req.section,
        sourceDocumentId: documentId,
        extractionConfidence: req.confidence,
        isMandatory: req.isMandatory,
        extractionMethod: 'AI',
      },
    });
  }

  // 5. Store evaluation factors
  for (const factor of extracted.evaluationFactors) {
    await db.evaluationFactor.create({
      data: {
        solicitationId,
        factorName: factor.name,
        description: factor.description,
        weight: factor.weight,
        sourceDocumentId: documentId,
        extractionConfidence: factor.confidence,
      },
    });
  }

  // 6. Store ambiguity flags
  for (const ambiguity of extracted.ambiguities) {
    await db.ambiguityFlag.create({
      data: {
        solicitationId,
        flagType: ambiguity.type,
        description: ambiguity.description,
        severity: ambiguity.severity,
        affectedAreas: ambiguity.affectedSections || [],
      },
    });
  }

  return extracted;
}
```

---

#### Phase 1D: Solicitation API Routes (2-3 days)

**Create `backend/src/routes/solicitations.ts`:**

```typescript
import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { uploadToS3 } from '../services/fileStorage';
import { parseRFPDocument } from '../services/solicitationParser';
import { db } from '../config/database';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// POST: Upload solicitation documents
router.post('/:solicitationId/upload', requireAuth, requireTenant, upload.array('documents'), async (req, res) => {
  try {
    const { solicitationId } = req.params;
    const files = req.files as Express.Multer.File[];
    
    const solicitation = await db.solicitation.findUnique({ where: { id: solicitationId } });
    if (!solicitation) return res.status(404).json({ error: 'Solicitation not found' });

    const uploadedDocs = [];
    for (const file of files) {
      const s3Key = await uploadToS3(file.buffer, file.originalname);
      const doc = await db.solicitationDocument.create({
        data: {
          solicitationId,
          filename: file.originalname,
          s3Key,
          documentType: 'RFP',
          sizeBytes: file.size,
          pageCount: 0, // Will be updated after parsing
        },
      });
      uploadedDocs.push(doc);
    }

    res.json({ uploaded: uploadedDocs });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST: Trigger parsing of uploaded documents
router.post('/:solicitationId/parse', requireAuth, requireTenant, async (req, res) => {
  try {
    const { solicitationId } = req.params;
    
    const documents = await db.solicitationDocument.findMany({ where: { solicitationId } });
    
    await db.solicitation.update({
      where: { id: solicitationId },
      data: { parseStatus: 'PARSING' },
    });

    // Queue parsing as background job (use BullMQ)
    // For now, do synchronously for proof of concept
    for (const doc of documents) {
      try {
        const { downloadFromS3 } = await import('../services/fileStorage');
        const buffer = await downloadFromS3(doc.s3Key);
        const extracted = await parseRFPDocument(buffer, solicitationId, doc.id);
        
        await db.solicitationDocument.update({
          where: { id: doc.id },
          data: { pageCount: 0 }, // Update with actual count from parsing
        });
      } catch (docError) {
        console.error(`Failed to parse ${doc.filename}:`, docError);
      }
    }

    await db.solicitation.update({
      where: { id: solicitationId },
      data: { parseStatus: 'PARSED', lastParsedAt: new Date() },
    });

    res.json({ status: 'Parsing complete' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET: Fetch requirements for a solicitation
router.get('/:solicitationId/requirements', requireAuth, requireTenant, async (req, res) => {
  try {
    const { solicitationId } = req.params;
    const requirements = await db.requirement.findMany({
      where: { solicitationId, isActive: true },
      include: { sourceDocument: true },
    });
    res.json(requirements);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET: Fetch evaluation factors
router.get('/:solicitationId/evaluation-factors', requireAuth, requireTenant, async (req, res) => {
  try {
    const { solicitationId } = req.params;
    const factors = await db.evaluationFactor.findMany({ where: { solicitationId } });
    res.json(factors);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET: Fetch ambiguity flags
router.get('/:solicitationId/ambiguities', requireAuth, requireTenant, async (req, res) => {
  try {
    const { solicitationId } = req.params;
    const ambiguities = await db.ambiguityFlag.findMany({
      where: { solicitationId, isResolved: false },
    });
    res.json(ambiguities);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
```

---

### Phase 1E: Frontend Integration (3-4 days)

**Create `frontend/src/components/SolicitationUpload.tsx`:**

```typescript
import React, { useState } from 'react';

export function SolicitationUpload({ solicitationId }: { solicitationId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [requirements, setRequirements] = useState<any[]>([]);

  const handleUpload = async () => {
    setUploading(true);
    const formData = new FormData();
    files.forEach(f => formData.append('documents', f));
    
    try {
      const res = await fetch(`/api/solicitations/${solicitationId}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      alert(`Uploaded ${data.uploaded.length} documents`);
    } finally {
      setUploading(false);
    }
  };

  const handleParse = async () => {
    setParsing(true);
    try {
      const res = await fetch(`/api/solicitations/${solicitationId}/parse`, {
        method: 'POST',
      });
      const data = await res.json();
      
      // Fetch requirements
      const reqRes = await fetch(`/api/solicitations/${solicitationId}/requirements`);
      const reqs = await reqRes.json();
      setRequirements(reqs);
      alert(`Extracted ${reqs.length} requirements`);
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="p-6 border rounded">
      <h2 className="text-2xl font-bold mb-4">Upload Solicitation Documents</h2>
      
      <input
        type="file"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files || []))}
        accept=".pdf"
        disabled={uploading}
      />
      
      <button
        onClick={handleUpload}
        disabled={uploading || files.length === 0}
        className="px-4 py-2 bg-blue-600 text-white rounded mt-2"
      >
        {uploading ? 'Uploading...' : 'Upload Documents'}
      </button>

      <button
        onClick={handleParse}
        disabled={parsing}
        className="px-4 py-2 bg-green-600 text-white rounded mt-2 ml-2"
      >
        {parsing ? 'Parsing...' : 'Parse & Extract Requirements'}
      </button>

      {requirements.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xl font-bold mb-2">Extracted Requirements</h3>
          <div className="space-y-2">
            {requirements.map((req) => (
              <div key={req.id} className="p-3 bg-gray-100 rounded">
                <p className="font-semibold">{req.statement}</p>
                <p className="text-sm text-gray-600">Type: {req.requirementType} | Mandatory: {req.isMandatory ? 'Yes' : 'No'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## PART 2: PROPOSAL OUTLINE GENERATION (High Priority)

Once requirements are extracted, proposals must map sections to requirements. This requires:

1. **Backend Service** (`backend/src/services/proposalOutlineGenerator.ts`) that uses Claude to create section outlines from requirements
2. **API Routes** in `backend/src/routes/proposals.ts` for outline generation and retrieval
3. **Frontend UI** to display and edit proposal outlines

### Key Principle
Every section in the proposal must:
- Be mapped to 1+ requirements
- Show coverage status (Uncovered, Partial, Covered)
- Display linked evidence artifacts
- Have an evidence panel for drafting

---

## PART 3: EVIDENCE ARTIFACT MANAGEMENT

**New Schema Entities** (Add to `schema.prisma`):

```prisma
model EvidenceArtifact {
  id             String   @id @default(uuid())
  consultingFirmId String
  title          String
  description    String?
  artifactType   String   // CASE_STUDY, PAST_PERFORMANCE, CERTIFICATION, WHITEPAPER, etc.
  
  // Storage
  s3Key          String?  // If file-based
  content        String?  // If text-based
  url            String?  // If external reference
  
  // Linking
  clientCompanyId String?
  
  // Metadata
  relevantNaics  String[]  @default([])
  relevantAgencies String[] @default([])
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  consultingFirm ConsultingFirm @relation(fields: [consultingFirmId], references: [id], onDelete: Cascade)
  clientCompany  ClientCompany? @relation(fields: [clientCompanyId], references: [id])

  @@index([consultingFirmId])
  @@map("evidence_artifacts")
}
```

---

## NEXT STEPS

### Immediate (This Week)
1. **Extend schema** with Solicitation, Requirement, EvaluationFactor, Amendment, AmbiguityFlag entities
2. **Set up S3 integration** for document storage
3. **Build proof-of-concept parser** using Claude API
4. **Create upload and parse endpoints**

### Following Week
1. **Build requirement matrix UI**
2. **Implement proposal outline generation**
3. **Add evidence artifact management**
4. **Integrate into proposal workspace**

### Week 3
1. **Build submission readiness validator**
2. **Create adherence scoring dashboard**
3. **Test end-to-end: RFP → Proposal → Export**

---

## Success Metrics

- ✅ Upload RFP to export proposal in < 30 minutes
- ✅ 95%+ requirement capture accuracy
- ✅ Zero missed mandatory requirements in checklist
- ✅ 100% of proposal sections mapped to requirements
- ✅ All claims linked to evidence with confidence scores
