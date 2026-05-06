# Phase 1B Implementation Plan — Proposal Sections & Requirement Mapping

**Phase:** 1B (Follows Phase 1A)  
**Timeline:** 2 weeks  
**Effort:** 2 engineers (1 backend, 1 frontend)  
**Status:** 🔵 PLANNING  

---

## Overview

**Goal:** Map RFP requirements to proposal sections and auto-generate section outlines.

**What Gets Built:**
1. ProposalSection schema entity
2. Section-to-requirement mapping logic (AI-powered via Claude)
3. Section editor UI with requirement coverage visualization
4. Enhanced generateProposalOutline to create sections
5. Evidence artifact foundation (links to Phase 1C)

**Success Criteria:**
- ✅ Each RFP requirement maps to 1+ proposal sections
- ✅ Sections auto-generate outlines based on mapped requirements
- ✅ Users can manually adjust section assignments
- ✅ Coverage visualization shows which requirements are addressed
- ✅ Sections preserve context for Phase 1C evidence artifacts

---

## Architecture

### Data Model

**New Entity: ProposalSection**

```prisma
model ProposalSection {
  id                    String                      @id @default(cuid())
  opportunityId         String
  opportunity           Opportunity                 @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  
  // Content
  sectionName           String                      // e.g., "Technical Approach", "Team Experience"
  sectionDescription   String?                     // Optional sub-heading
  outlineText          String?                     // AI-generated or user-provided outline
  isCustom             Boolean        @default(false) // true if user created/modified
  
  // Mapping to requirements
  mappedRequirements   MatrixRequirement[]         // M:M via proposalSectionId
  requirementCount     Int            @default(0)  // Cached count for performance
  coverageStatus       String         @default("UNCOVERED") // UNCOVERED, PARTIAL, COVERED
  
  // Generation metadata
  generatedAt         DateTime?
  generatedByPrompt   String?                     // Store the prompt used for reproducibility
  manualAdjustments   String?                     // JSON tracking user changes
  
  // Ordering
  displayOrder        Int            @default(0)  // For section ordering in proposal
  
  // Timestamps
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  @@index([opportunityId])
  @@index([coverageStatus])
}
```

**Enhanced MatrixRequirement** (from Phase 1A):
```prisma
// Add/update in Phase 1B:
proposalSectionId     String?                    // FK to ProposalSection
proposalSection       ProposalSection?           @relation(fields: [proposalSectionId], references: [id])
requirementWeight     Int         @default(1)    // 1-5 importance level (set during mapping)
```

---

## Backend Tasks

### Task B1: Schema Design & Migration
**Effort:** 4 hours  
**Owner:** Backend engineer

**Deliverables:**
1. ProposalSection model in `schema.prisma`
2. Migration file: `prisma/migrations/X_add_proposal_sections`
3. Index on opportunityId for query performance
4. Rollback plan documented

**Acceptance Criteria:**
- [ ] Migration runs without errors
- [ ] Schema matches above definition
- [ ] Backward compatible (no breaking changes)
- [ ] Tested in dev environment

---

### Task B2: Section Outline Generation Service
**Effort:** 8 hours  
**Owner:** Backend engineer

**File:** `backend/src/services/sectionOutlineGenerator.ts` (NEW, ~220 lines)

**Core Function:**
```typescript
generateSectionOutlines(
  opportunityId: string,
  requirements: MatrixRequirement[],
  consultingFirmId: string
): Promise<SectionOutlineResult>
```

**Process:**
1. Group requirements into logical sections (via Claude + LLM clustering)
2. For each section:
   - Determine section name (Technical, Team, Risk, etc.)
   - Map requirements to section
   - Generate outline using Claude
   - Set coverage status (UNCOVERED/PARTIAL/COVERED based on mapped requirements)
3. Create ProposalSection records with generated outlines
4. Return mapping results

**Claude Prompt Logic:**
- Analyze all requirements
- Identify 5-8 major proposal sections
- For each section, map which requirements it addresses
- Generate 2-3 bullet point outline per section
- Assign importance weights to requirements
- Suggest section ordering

**Exports:**
```typescript
interface SectionOutlineRequest {
  opportunityId: string;
  requirementCount: number;
  requirementsText: string; // JSON-stringified requirements
}

interface GeneratedSection {
  name: string;
  description?: string;
  outlineText: string;
  mappedRequirementIds: string[];
  coverageStatus: 'UNCOVERED' | 'PARTIAL' | 'COVERED';
  displayOrder: number;
}

interface SectionOutlineResult {
  sections: GeneratedSection[];
  totalRequirements: number;
  mappedCount: number;
  unmappedCount: number;
  confidence: number;
  generatedAt: DateTime;
}
```

**Key Design Points:**
- Reuse llmRouter for firm's LLM choice
- Store generated prompt for reproducibility
- 0.3 temperature for consistent outputs
- ~1000 token output limit per section
- Timeout: 30 seconds per section (5 min total)

---

### Task B3: Proposal Sections API Endpoints
**Effort:** 6 hours  
**Owner:** Backend engineer

**File:** `backend/src/routes/proposalSections.ts` (NEW, ~240 lines)

**Endpoints:**

**GET** `/api/opportunities/:opportunityId/proposal-sections`
- Returns all sections for opportunity
- Optional query: `?withRequirements=true` (includes mapped requirements)
- Returns: `{ sections: ProposalSection[], statistics: { totalSections, totalMapped, avgCoverage } }`

**POST** `/api/opportunities/:opportunityId/proposal-sections/generate`
- Auto-generate sections from extracted requirements
- Request: `{ autoMapRequirements: boolean }`
- Response: `{ success, sectionsCreated, sectionsCount, message }`
- Business logic:
  - Fetch all extracted requirements
  - Call generateSectionOutlines()
  - Create ProposalSection records
  - Map requirements to sections via proposalSectionId update
  - Return results
- Idempotency: If sections exist, return existing sections (don't duplicate)

**PATCH** `/api/opportunities/:opportunityId/proposal-sections/:sectionId`
- Update section details
- Request: `{ sectionName?, sectionDescription?, outlineText?, displayOrder?, isCustom? }`
- Response: Updated ProposalSection
- Validation:
  - sectionName required if provided (max 100 chars)
  - displayOrder must be unique per opportunity
  - outlineText max 5000 chars
- Effect: Sets isCustom=true when user edits

**POST** `/api/opportunities/:opportunityId/proposal-sections/:sectionId/map-requirement`
- Add requirement to section
- Request: `{ requirementId, requirementWeight? }`
- Response: `{ success, message, section: ProposalSection }`
- Validation: requirement must exist, weight 1-5
- Effect: Updates MatrixRequirement.proposalSectionId

**DELETE** `/api/opportunities/:opportunityId/proposal-sections/:sectionId/unmap-requirement/:requirementId`
- Remove requirement from section
- Response: Updated ProposalSection
- Effect: Sets MatrixRequirement.proposalSectionId to null

**POST** `/api/opportunities/:opportunityId/proposal-sections/:sectionId/unmap-all`
- Clear all requirement mappings for a section
- Response: `{ success, unmappedCount }`

**DELETE** `/api/opportunities/:opportunityId/proposal-sections/:sectionId`
- Delete section
- Validation: Only delete if no evidence artifacts link to it (Phase 1C concern)
- Response: `{ success, message }`

---

### Task B4: Backend Integration & Testing
**Effort:** 4 hours  
**Owner:** Backend engineer

**Changes to existing files:**

**`backend/src/server.ts`** (+0 lines, no worker needed)
- No worker needed for outline generation (synchronous API call)

**`backend/src/routes/complianceMatrix.ts`** (+10 lines)
- Add link in GET requirements response: `sections: ProposalSection[]` if `?withSections=true`

**Integration Tests:**
- [ ] POST /generate creates 5-8 sections
- [ ] Sections have unique displayOrder
- [ ] Requirements properly mapped
- [ ] GET returns sections with statistics
- [ ] PATCH updates without duplicating sections
- [ ] Manual mapping prevents duplicates
- [ ] Coverage status calculated correctly
- [ ] Deletion respects constraints

---

## Frontend Tasks

### Task F1: Section Editor Component
**Effort:** 10 hours  
**Owner:** Frontend engineer

**File:** `frontend/src/components/ProposalSectionEditor.tsx` (NEW, ~450 lines)

**Component Structure:**

```typescript
interface ProposalSectionEditorProps {
  opportunityId: string;
  onSectionChange?: (sections: ProposalSection[]) => void;
}

function ProposalSectionEditor({ opportunityId, onSectionChange }: Props) {
  // Core features...
}
```

**Features:**

1. **Auto-Generate Button**
   - "Generate Proposal Sections from Requirements"
   - Shows loading state during generation
   - Confirms number of sections created
   - Disabled if no requirements extracted yet

2. **Section List**
   - Display all sections in displayOrder
   - Drag-to-reorder sections (update displayOrder via API)
   - Show coverage % for each section
   - Color-code coverage (Red: 0%, Yellow: 1-50%, Green: 51-100%)
   - Show mapped requirement count per section

3. **Section Detail Panel** (on click)
   - Section name (editable inline)
   - Section description (editable)
   - Generated outline (editable textarea)
   - "Is Custom" toggle showing it's user-edited
   - Mapped requirements list with drag-to-remove
   - Add requirement selector (dropdown to unmapped requirements)
   - Delete section button

4. **Requirement Mapping UI**
   - Two-column layout: "Unmapped Requirements" | "This Section"
   - Drag-and-drop between columns
   - Requirement cards show:
     - Text (truncated)
     - Mandatory badge if applicable
     - Confidence % (dim if low)
     - Weight slider (1-5) when mapped
   - Search/filter unmapped requirements

5. **Coverage Summary**
   - Total requirements: X
   - Mapped to sections: Y (Z%)
   - Unmapped: X-Y
   - By status: UNCOVERED, PARTIAL, COVERED
   - Alert: "X requirements not mapped to any section"

6. **Manual Adjustment Tracking**
   - Show indicator when section has been modified by user
   - "Reset to AI-generated" button to revert edits
   - Timestamp of generation + user edits

**API Calls:**
- GET `/api/opportunities/:id/proposal-sections?withRequirements=true`
- POST `/api/opportunities/:id/proposal-sections/generate`
- PATCH `/api/opportunities/:id/proposal-sections/:id`
- POST `/api/opportunities/:id/proposal-sections/:id/map-requirement`
- DELETE `/api/opportunities/:id/proposal-sections/:id/unmap-requirement/:reqId`
- GET `/api/compliance-matrix/:id/requirements` (for unmapped list)

**Styling:**
- Tailwind-based responsive layout
- Card-based design matching RequirementExtractionStatus component
- Drag-and-drop visual feedback
- Progress indicators during generation

---

### Task F2: Integration into OpportunityDetail Page
**Effort:** 3 hours  
**Owner:** Frontend engineer

**Changes:**

**`frontend/src/pages/OpportunityDetail.tsx`**
```typescript
// Add tabs or accordion:
<Tabs defaultValue="requirements">
  <TabTrigger value="requirements">RFP Requirements</TabTrigger>
  <TabTrigger value="sections">Proposal Sections</TabTrigger>
</Tabs>

<TabContent value="requirements">
  <RequirementExtractionStatus 
    opportunityId={opportunityId}
    onExtractionComplete={(count) => {
      // Optionally trigger section generation
      // or show "Ready to generate sections" button
    }}
  />
</TabContent>

<TabContent value="sections">
  <ProposalSectionEditor
    opportunityId={opportunityId}
    onSectionChange={(sections) => {
      // Could trigger downstream updates (Phase 1C)
    }}
  />
</TabContent>
```

**Acceptance Criteria:**
- [ ] Tab navigation works
- [ ] Both components load correctly
- [ ] Data flows between components (extraction → sections)
- [ ] No console errors

---

### Task F3: Testing & Polish
**Effort:** 3 hours  
**Owner:** Frontend engineer

**Manual Test Cases:**
1. [ ] Load opportunity with extracted requirements
2. [ ] Click "Generate Sections" → 5-8 sections created
3. [ ] Verify all requirements mapped
4. [ ] Click section → detail panel opens
5. [ ] Drag requirement to unmapped → requirement removed + API called
6. [ ] Add requirement back → shows in section + weight adjustable
7. [ ] Edit section name → saves via PATCH
8. [ ] Drag section to reorder → displayOrder updated
9. [ ] Check coverage % updates as requirements mapped/unmapped
10. [ ] Reset section to AI-generated → reverts edits
11. [ ] Verify responsive on mobile

**Performance:**
- [ ] Component renders <200ms
- [ ] Drag-and-drop smooth (60fps)
- [ ] API calls debounced (no duplicate requests)

---

## Design Decisions

### Why Claude for Section Generation?
- ✅ Understands RFP structure and standard proposal sections
- ✅ Can group related requirements intelligently
- ✅ Generates human-readable outlines, not just lists
- ✅ Respects firm's LLM choice via llmRouter

### Why Manual Mapping UI?
- ✅ Users often have specific proposal structure preferences
- ✅ Some requirements may map to multiple sections
- ✅ Drag-and-drop more intuitive than checkboxes
- ✅ Supports "Unmapped" view for requirements validation

### Why ProposalSection (not embed in Opportunity)?
- ✅ Separate entity supports Phase 1C (evidence artifacts per section)
- ✅ Can have many sections (1:M relationship)
- ✅ Can regenerate without losing user edits (isCustom flag)
- ✅ Supports future features: versioning, templates, sharing

### Storage: Generation Metadata
- Store Claude prompt for reproducibility
- Track user edits in manualAdjustments JSON
- isCustom flag avoids re-overwriting user changes

---

## Dependencies

**On Phase 1A:**
- ✅ MatrixRequirement must be extracted (Phase 1A done)
- ✅ Requirements must have confidence scores (Phase 1A provides)
- ✅ Opportunity must exist (Phase 1A depends on this)

**External:**
- ✅ Anthropic API for Claude (already available)
- ✅ Redis for BullMQ (for future async generation if needed)
- ✅ PostgreSQL for schema (already running)

**No Dependencies On:**
- ❌ Phase 1C (evidence artifacts can be built independently)
- ❌ Phase 1D (submission readiness can be built independently)

---

## Testing Strategy

### Unit Tests (Backend)
- `generateSectionOutlines()`: Mock Claude, verify section structure
- API endpoints: Input validation, error handling
- Database: Ensure schema constraints work

### Integration Tests (Backend)
- Full flow: Requirements → Generate Sections → Verify mapping
- Manual mapping: Add/remove requirements from sections
- Coverage calculation: Verify correct status transitions

### E2E Tests (Frontend)
- Generate sections → Verify UI updates
- Drag-and-drop requirements → Verify API calls
- Edit section → Verify persistence
- Coverage visualization → Verify colors correct

### Performance Tests
- Generation time: < 30 seconds for 50 requirements
- Component render: < 200ms
- Drag-and-drop: 60fps smooth
- API response time: < 500ms

---

## Rollout Plan

**Week 1:**
- Day 1-2: Schema + data model (B1)
- Day 2-3: Section outline generator (B2)
- Day 4-5: API endpoints (B3)
- Day 5: Backend integration & testing (B4)

**Week 2:**
- Day 1-2: Frontend component (F1)
- Day 3: Integration into OpportunityDetail (F2)
- Day 4: E2E testing & polish (F3)
- Day 5: Code review, deploy to staging, team training

**Deployment:**
- Merge to main when Phase 1A already in prod
- No data migration needed (new schema)
- Rollback: Drop ProposalSection table, revert code

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Claude section generation too slow | Low | Medium | Set timeout, fallback to empty sections |
| User frustrated with AI sections | Low | Low | Easy to edit and reset, manual override UI |
| Requirement mapping M:M complexity | Very Low | Low | Keep first-version 1:M, add M:M in Phase 2 |
| Schema constraints too strict | Low | Low | Test edge cases in dev |
| Performance with 1000+ requirements | Low | Medium | Implement pagination in UI |

---

## Success Metrics

**After Phase 1B Completes:**
- ✅ Users can generate proposal sections in < 30 seconds
- ✅ 100% of extracted requirements mapped to sections
- ✅ Zero duplicate section names per opportunity
- ✅ Users can manually adjust all mappings
- ✅ Coverage visualization clear and actionable
- ✅ Component performance meets SLAs
- ✅ Integration tests pass
- ✅ Documentation complete

---

## Files to Create/Modify

**Create:**
```
backend/prisma/migrations/X_add_proposal_sections.sql
backend/src/services/sectionOutlineGenerator.ts        (220 lines)
backend/src/routes/proposalSections.ts                 (240 lines)
frontend/src/components/ProposalSectionEditor.tsx      (450 lines)
```

**Modify:**
```
backend/prisma/schema.prisma                           (+30 lines)
backend/src/routes/complianceMatrix.ts                 (+10 lines)
frontend/src/pages/OpportunityDetail.tsx               (+50 lines)
```

**Total Lines:** ~1,000 backend, ~500 frontend

---

## Next Phase: Phase 1C

**Evidence Artifacts** (after Phase 1B)
- Evidence model linking to ProposalSection
- Document/file storage per evidence item
- Evidence panel UI showing artifacts per section
- Timeline: 1-2 weeks, 2 engineers

---

## Conclusion

Phase 1B transforms requirements into proposal structure, enabling:
- Intelligent RFP-to-proposal mapping
- Coverage visualization
- Foundation for evidence artifacts (Phase 1C)
- Manual flexibility for user preferences

**Status:** Ready to implement  
**Timeline:** 2 weeks  
**Effort:** 2 engineers  

---

**To begin Phase 1B:**
1. Finalize this plan with team
2. Assign backend and frontend engineers
3. Start with schema design (Task B1)
4. Follow weekly rollout plan above

Next: Create detailed API specification and database schema diagram.
