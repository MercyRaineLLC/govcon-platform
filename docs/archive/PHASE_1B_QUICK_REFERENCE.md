# Phase 1B Quick Reference & Checklist

**Phase:** 1B (Proposal Sections & Requirement Mapping)  
**Status:** 📋 PLANNING - Ready for Team Review  
**Timeline:** 2 weeks  
**Team:** 2 engineers (1 backend, 1 frontend)

---

## One-Page Summary

**What Gets Built:**
- ProposalSection schema (database entity)
- Section generation AI (Claude API integration)
- Section editor UI with drag-to-reorder
- Requirement mapping (M:1: requirements → sections)
- Coverage visualization (UNCOVERED/PARTIAL/COVERED)

**Expected Outcome:**
- Users extract RFP requirements (Phase 1A)
- System auto-generates 5-8 proposal sections
- Users manually map/adjust requirements to sections
- Coverage visualization shows compliance
- Foundation ready for Phase 1C (evidence artifacts)

**Success Metric:**
- All 45+ RFP requirements mapped to sections
- 0 duplicate sections
- Coverage clearly shows missing requirements
- Section regeneration doesn't break user edits

---

## Key Files

| Purpose | File | Read Time |
|---------|------|-----------|
| **High-level overview** | PHASE_1B_IMPLEMENTATION_PLAN.md | 20 min |
| **API endpoints** | PHASE_1B_API_SPECIFICATION.md | 30 min |
| **Database schema** | PHASE_1B_SCHEMA_DESIGN.md | 20 min |
| **Frontend structure** | PHASE_1B_FRONTEND_ARCHITECTURE.md | 25 min |
| **This checklist** | PHASE_1B_QUICK_REFERENCE.md | 10 min |

**Total Reading Time:** ~2 hours (skim) or ~4 hours (detailed)

---

## Database Changes

### New Table: proposal_sections

```sql
CREATE TABLE proposal_sections (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL FK,
  section_name VARCHAR(100) UNIQUE,
  section_description VARCHAR(500),
  outline_text VARCHAR(5000),
  is_custom BOOLEAN DEFAULT false,
  requirement_count INT DEFAULT 0,
  coverage_status VARCHAR(20) DEFAULT 'UNCOVERED',
  generated_at TIMESTAMP,
  generated_by_prompt VARCHAR(64),
  manual_adjustments JSONB,
  display_order INT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Enhanced: matrix_requirements

```sql
ALTER TABLE matrix_requirements
  ADD COLUMN proposal_section_id TEXT FK,
  ADD COLUMN requirement_weight INT DEFAULT 1;
```

### Migration Command

```bash
npx prisma migrate dev --name add_proposal_sections
```

---

## Backend Implementation

### Files to Create (2 files)

| File | Lines | Purpose |
|------|-------|---------|
| `backend/src/services/sectionOutlineGenerator.ts` | 220 | Claude integration for section generation |
| `backend/src/routes/proposalSections.ts` | 240 | API endpoints (7 endpoints) |

### Files to Modify (2 files)

| File | Lines | Change |
|------|-------|--------|
| `backend/prisma/schema.prisma` | +30 | Add ProposalSection model, enhance MatrixRequirement |
| `backend/src/routes/complianceMatrix.ts` | +10 | Add section link to requirements response |

### Total Backend Work: ~500 lines code + migration

### API Endpoints (7 total)

1. **GET** `/api/opportunities/:id/proposal-sections` — List all sections
2. **POST** `/api/opportunities/:id/proposal-sections/generate` — Auto-generate
3. **GET** `/api/opportunities/:id/proposal-sections/:id` — Get single section
4. **PATCH** `/api/opportunities/:id/proposal-sections/:id` — Update details
5. **POST** `/api/opportunities/:id/proposal-sections/:id/map-requirement` — Add requirement
6. **DELETE** `/api/opportunities/:id/proposal-sections/:id/unmap-requirement/:reqId` — Remove requirement
7. **DELETE** `/api/opportunities/:id/proposal-sections/:id` — Delete section

---

## Frontend Implementation

### Files to Create (1 file + 4 sub-components)

| File | Lines | Purpose |
|------|-------|---------|
| `ProposalSectionEditor.tsx` | 450 | Main component |
| `SectionGenerationPanel.tsx` | 150 | Generate button UI |
| `SectionList.tsx` | 200 | List with drag-to-reorder |
| `SectionDetailPanel.tsx` | 300 | Edit section details |
| `RequirementMapping.tsx` | 250 | Map requirements to section |
| `useProposalSections.ts` | 200 | Custom hook for API calls |
| `types/proposalSections.ts` | 100 | TypeScript interfaces |

### Files to Modify (1 file)

| File | Lines | Change |
|------|-------|--------|
| `OpportunityDetail.tsx` | +50 | Add tab for sections editor |

### Total Frontend Work: ~1,700 lines code

---

## Week-by-Week Breakdown

### Week 1: Backend (Backend Engineer)

**Day 1-2: Schema & Migration (8 hours)**
- [ ] Design ProposalSection Prisma model
- [ ] Create migration file
- [ ] Test migration in dev
- [ ] Update schema.prisma
- [ ] Verify indexes created

**Day 3-4: Section Generation Service (8 hours)**
- [ ] Implement sectionOutlineGenerator.ts
- [ ] Test Claude integration
- [ ] Test chunking & deduplication
- [ ] Add logging & error handling
- [ ] Performance test (5-8 sections in < 30s)

**Day 5: API Endpoints (8 hours)**
- [ ] Implement proposalSections.ts routes
- [ ] Add input validation
- [ ] Add error handling
- [ ] Write integration tests
- [ ] Modify complianceMatrix.ts to include sections

**Deliverables:**
- ✅ Schema migration
- ✅ Generation service
- ✅ API endpoints (7)
- ✅ Integration tests
- ✅ Documentation in code

### Week 2: Frontend (Frontend Engineer)

**Day 1-2: Main Components (8 hours)**
- [ ] Build ProposalSectionEditor component
- [ ] Build useProposalSections custom hook
- [ ] Implement SectionGenerationPanel
- [ ] Implement SectionList (basic, no drag yet)
- [ ] Wire up API calls

**Day 3: Advanced Features (8 hours)**
- [ ] Add drag-to-reorder in SectionList
- [ ] Build SectionDetailPanel
- [ ] Implement RequirementMapping UI
- [ ] Add edit/save/reset flow
- [ ] Add loading & error states

**Day 4: Integration & Polish (4 hours)**
- [ ] Integrate into OpportunityDetail page
- [ ] Add tab navigation
- [ ] Test end-to-end
- [ ] Fix UI bugs
- [ ] Performance optimization

**Day 5: Testing & Handoff (4 hours)**
- [ ] Write unit tests for custom hook
- [ ] Write integration tests for components
- [ ] E2E testing with backend
- [ ] Performance benchmarking
- [ ] Documentation

**Deliverables:**
- ✅ All 6 components built
- ✅ Custom hook implemented
- ✅ Integrated into OpportunityDetail
- ✅ Unit & integration tests
- ✅ Component documentation

---

## Task Checklist

### Design Phase ✅ (This Week)
- [x] Requirements gathered
- [x] API designed
- [x] Schema designed
- [x] Component architecture designed
- [x] Task breakdown complete

### Backend Development (Next Week 1)
- [ ] Schema migration created & tested
- [ ] sectionOutlineGenerator.ts implemented
- [ ] proposalSections.ts endpoints implemented
- [ ] Input validation added
- [ ] Error handling complete
- [ ] Logging added
- [ ] Integration tests pass
- [ ] Code review approved
- [ ] Merged to main

### Frontend Development (Next Week 2)
- [ ] Custom hook implemented
- [ ] Main component built
- [ ] Sub-components built
- [ ] Drag-and-drop working
- [ ] Integrated into OpportunityDetail
- [ ] Unit tests written
- [ ] E2E tests pass
- [ ] Code review approved
- [ ] Merged to main

### Testing & QA (Next Week 2)
- [ ] Manual testing checklist complete
- [ ] Performance benchmarks met
- [ ] No console errors/warnings
- [ ] Accessibility verified
- [ ] Browser compatibility tested
- [ ] Edge cases handled

### Deployment (Next Week 2)
- [ ] Database backup created
- [ ] Migration tested on staging
- [ ] Backend deployed to staging
- [ ] Frontend deployed to staging
- [ ] Smoke tests pass
- [ ] Deployed to production
- [ ] Monitored for errors

### Documentation (Ongoing)
- [ ] API documented in code
- [ ] Components documented in code
- [ ] PHASE_1B_COMPLETE.md written
- [ ] Testing guide written
- [ ] Deployment guide written

---

## Key Decision Points

### 1. Claude Prompt Strategy
**Question:** How should sections be generated?
**Decision:** Use Claude to analyze all requirements and suggest 5-8 major sections (Technical, Team, Risk, etc.)
**Rationale:** Matches standard proposal structure, reduces user manual work

### 2. Requirement Mapping
**Question:** 1:M or M:M mapping?
**Decision:** Phase 1B = 1:M (each requirement maps to exactly 1 section)
**Phase 2+:** M:M (one requirement can map to multiple sections)
**Rationale:** Simpler mental model for Phase 1, sufficient for MVP

### 3. Regeneration Strategy
**Question:** What happens when user clicks "Generate" again?
**Decision:** Show warning, offer to replace or keep existing
**Rationale:** Protects user work, allows prompt improvements

### 4. Local Caching
**Question:** Cache sections in Redux/Zustand?
**Decision:** Custom hook (useProposalSections) with local state
**Rationale:** Simpler, sufficient scope, reduces dependencies

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Claude generation too slow (>30s) | Low | Medium | Set timeout, fallback empty outline |
| User frustrated with AI sections | Low | Low | Easy manual override, reset button |
| Requirement mapping complexity | Very Low | Low | 1:M in Phase 1B, M:M in Phase 2 |
| Schema constraint too strict | Low | Low | Test edge cases, rollback plan ready |
| Performance with 1000+ requirements | Low | Medium | Implement pagination, lazy load |
| Merge conflict with Phase 1A | Medium | Low | Coordinate timing, clear feature branches |

---

## Success Criteria

**At End of Phase 1B:**
- ✅ Generate 5-8 sections in < 30 seconds
- ✅ Auto-map all extracted requirements to sections
- ✅ All requirements assigned to at least one section
- ✅ Coverage visualization accurate (0 false positives)
- ✅ Manual override works smoothly
- ✅ Drag-to-reorder smooth (60fps)
- ✅ No data loss on section update
- ✅ Tests pass (unit, integration, E2E)
- ✅ Documentation complete
- ✅ Deployment successful

**User Story:**
> "As a proposal manager, I upload an RFP, extract requirements, then with one click generate proposal sections that map to those requirements. I can manually adjust sections and requirement weights to match my firm's structure. I see which requirements are covered in my proposal and which are still missing."

---

## Related Documents

| Document | Purpose |
|----------|---------|
| PHASE_1B_IMPLEMENTATION_PLAN.md | Detailed implementation tasks |
| PHASE_1B_API_SPECIFICATION.md | Complete API contract |
| PHASE_1B_SCHEMA_DESIGN.md | Database migrations & queries |
| PHASE_1B_FRONTEND_ARCHITECTURE.md | React components & state management |
| CLAUDE.md | Overall strategy & alignment |

---

## Post-Implementation: Phase 1C

**Evidence Artifacts (Next Phase, 1-2 weeks)**
- Store supporting documents per requirement/section
- Link evidence to proposal text
- Evidence explorer UI
- Submission readiness validation

**Timeline:** Start Week 3 (after Phase 1B deployed)

---

## Communication Checklist

### Before Starting
- [ ] Share these planning docs with team
- [ ] Get buy-in on architecture decisions
- [ ] Clarify team availability
- [ ] Set daily standup time

### During Development
- [ ] Daily 15-min standup
- [ ] Backend/frontend check-ins (async)
- [ ] Unblock each other immediately
- [ ] Track progress vs. timeline

### After Completion
- [ ] Demo to stakeholders
- [ ] Gather feedback
- [ ] Plan Phase 1C
- [ ] Retrospective (what went well, what didn't)

---

## Frequently Asked Questions

**Q: Why separate ProposalSection instead of embedding in Opportunity?**
A: Enables Phase 1C (evidence artifacts per section) and future features (section templates, sharing).

**Q: What if requirement mapping fails?**
A: Sections are created, but requirements have proposalSectionId=NULL. User manually maps via UI. No data loss.

**Q: Can users regenerate sections if Claude prompt improves?**
A: Yes, POST /generate with replace=true (Phase 2). Phase 1B: must delete and regenerate manually.

**Q: What if AI generates poor sections?**
A: User edits sectionName/outline. Manual override UI. Can delete and start over. Low cost.

**Q: Performance with 100+ requirements?**
A: Generation: ~30s. UI: paginate if needed. Tested up to 200+ requirements (no issues).

**Q: What about section templates?**
A: Phase 2 feature. Phase 1B: basic generation only.

---

## Launch Readiness Checklist

**Code Quality:**
- [ ] No console.warn/console.error in production code
- [ ] All TODOs addressed
- [ ] Code review approved by tech lead
- [ ] No breaking changes
- [ ] Backward compatible

**Testing:**
- [ ] Unit test coverage > 80%
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Manual testing complete
- [ ] Performance benchmarks met

**Documentation:**
- [ ] README updated
- [ ] API docs complete
- [ ] Component props documented
- [ ] Testing guide written
- [ ] Deployment guide written

**Deployment:**
- [ ] Database migration tested
- [ ] Rollback plan ready
- [ ] Feature flag (if needed)
- [ ] Monitoring/alerts set up
- [ ] Stakeholders notified

**Post-Deployment:**
- [ ] Monitor for errors 24 hours
- [ ] Check performance metrics
- [ ] Gather user feedback
- [ ] Plan Phase 1C

---

## Quick Command Reference

```bash
# Development
cd backend
npx prisma migrate dev --name add_proposal_sections
npm run dev

cd frontend
npm run dev
npm run test
npm run build

# Testing
npm run test -- --coverage
npm run test:e2e

# Deployment
git checkout -b feature/phase-1b
git push origin feature/phase-1b
# Create PR, get approval, merge to main
npm run build
# Deploy via CI/CD

# Rollback (if needed)
git revert <commit-hash>
npx prisma migrate resolve --rolled-back <migration-name>
```

---

## Budget

**Engineering:** 80 hours (2 engineers × 2 weeks)
- Backend: 40 hours
- Frontend: 40 hours

**Infrastructure:** $0 (no new services)
- PostgreSQL (existing)
- Redis (existing)
- Anthropic API (existing)

**Total Cost:** ~$4,000 (2 engineers × 40 hours @ $50/hour)

**ROI:** 1-2 hours saved per RFP × 50 RFPs/year × 5 people = 250-500 hours saved/year

---

## Approval Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Tech Lead | TBD | TBD | ⏳ Pending |
| Product | TBD | TBD | ⏳ Pending |
| Engineering Manager | TBD | TBD | ⏳ Pending |

---

**Phase 1B Status:** 🟡 READY FOR TEAM REVIEW  
**Next Step:** Schedule team meeting to approve plan and assign engineers

