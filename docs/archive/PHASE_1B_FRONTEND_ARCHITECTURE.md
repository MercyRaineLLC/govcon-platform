# Phase 1B Frontend Architecture — Proposal Sections

**Status:** 📋 PLANNING  
**Framework:** React + TypeScript  
**Styling:** Tailwind CSS  
**State Management:** React Hooks (no Redux/Zustand needed)

---

## Component Hierarchy

```
OpportunityDetail
├── RequirementExtractionStatus (Phase 1A, existing)
└── ProposalSectionEditor (Phase 1B, new)
    ├── SectionGenerationPanel
    │   └── GenerateButton
    │   └── LoadingIndicator
    │   └── SuccessMessage
    ├── SectionList
    │   ├── SectionListItem (map over sections)
    │   │   ├── SectionHeader
    │   │   ├── SectionStats
    │   │   └── ExpandButton
    │   └── DragHandle (reordering)
    └── SectionDetailPanel (conditional, on section click)
        ├── SectionNameEditor
        ├── SectionDescriptionEditor
        ├── SectionOutlineEditor
        ├── SectionMetadata
        ├── RequirementMapping
        │   ├── UnmappedRequirementsList
        │   ├── DragDropZone
        │   └── MappedRequirementsList
        │       └── RequirementCard (map over requirements)
        │           ├── RequirementText
        │           ├── WeightSlider
        │           └── RemoveButton
        └── SectionActions
            ├── SaveButton
            ├── ResetButton
            ├── DeleteButton
```

---

## File Structure

```
frontend/src/
├── components/
│   ├── RequirementExtractionStatus.tsx        (Phase 1A, existing)
│   ├── ProposalSectionEditor/
│   │   ├── ProposalSectionEditor.tsx          (NEW, ~450 lines, main component)
│   │   ├── SectionGenerationPanel.tsx         (NEW, ~150 lines)
│   │   ├── SectionList.tsx                    (NEW, ~200 lines)
│   │   ├── SectionDetailPanel.tsx             (NEW, ~300 lines)
│   │   ├── RequirementMapping.tsx             (NEW, ~250 lines)
│   │   ├── types.ts                           (NEW, interfaces)
│   │   └── styles.ts                          (NEW, Tailwind constants, optional)
│   └── ...existing components...
├── hooks/
│   └── useProposalSections.ts                 (NEW, ~200 lines, custom hook)
├── types/
│   ├── index.ts                               (merge with existing)
│   └── proposalSections.ts                    (NEW, TypeScript interfaces)
├── pages/
│   └── OpportunityDetail.tsx                  (MODIFIED, add section editor)
└── ...existing structure...
```

---

## Data Types (TypeScript)

**File:** `frontend/src/types/proposalSections.ts`

```typescript
export interface ProposalSection {
  id: string;
  opportunityId: string;
  sectionName: string;
  sectionDescription?: string;
  outlineText?: string;
  isCustom: boolean;
  requirementCount: number;
  coverageStatus: 'UNCOVERED' | 'PARTIAL' | 'COVERED';
  displayOrder: number;
  generatedAt?: string;
  generatedByPrompt?: string;
  manualAdjustments?: ManualAdjustments;
  createdAt: string;
  updatedAt: string;
  mappedRequirements?: MappedRequirement[];
}

export interface ManualAdjustments {
  editedFields: string[];
  addedRequirements: string[];
  removedRequirements: string[];
  lastModified?: string;
  modifiedBy?: string;
}

export interface MappedRequirement {
  id: string;
  requirementText: string;
  isMandatory: boolean;
  extractionConfidence: number;
  requirementWeight: number;
  sourcePageNumber?: number;
  extractionMethod: string;
}

export interface SectionStatistics {
  totalSections: number;
  totalRequirements: number;
  mappedRequirements: number;
  unmappedRequirements: number;
  averageCoverage: number;
  coverageByStatus: {
    UNCOVERED: number;
    PARTIAL: number;
    COVERED: number;
  };
}

export interface GenerationRequest {
  autoMapRequirements: boolean;
  generateOutlines: boolean;
}

export interface GenerationResult {
  success: boolean;
  message: string;
  sectionsCreated: number;
  requirementsMapped: number;
  sections: ProposalSection[];
  generatedAt: string;
}
```

---

## Custom Hook: useProposalSections

**File:** `frontend/src/hooks/useProposalSections.ts` (~200 lines)

```typescript
interface UseProposalSectionsReturn {
  sections: ProposalSection[];
  statistics: SectionStatistics | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
  
  // Actions
  fetchSections: () => Promise<void>;
  generateSections: (req: GenerationRequest) => Promise<GenerationResult>;
  updateSection: (sectionId: string, updates: Partial<ProposalSection>) => Promise<void>;
  mapRequirement: (sectionId: string, requirementId: string, weight: number) => Promise<void>;
  unmapRequirement: (sectionId: string, requirementId: string) => Promise<void>;
  unmapAllRequirements: (sectionId: string) => Promise<void>;
  deleteSection: (sectionId: string) => Promise<void>;
  reorderSection: (sectionId: string, newOrder: number) => Promise<void>;
}

export function useProposalSections(opportunityId: string): UseProposalSectionsReturn {
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [statistics, setStatistics] = useState<SectionStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const token = localStorage.getItem('auth_token');
  
  const fetchSections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const res = await fetch(
        `/api/opportunities/${opportunityId}/proposal-sections?withRequirements=false`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const data = await res.json();
      
      setSections(data.sections);
      setStatistics(data.statistics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [opportunityId, token]);
  
  const generateSections = useCallback(async (req: GenerationRequest): Promise<GenerationResult> => {
    try {
      setGenerating(true);
      setError(null);
      
      const res = await fetch(
        `/api/opportunities/${opportunityId}/proposal-sections/generate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(req),
        }
      );
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || `Generation failed: ${res.status}`);
      }
      
      const result = await res.json();
      await fetchSections(); // Refresh sections
      
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setGenerating(false);
    }
  }, [opportunityId, token, fetchSections]);
  
  const updateSection = useCallback(
    async (sectionId: string, updates: Partial<ProposalSection>) => {
      try {
        setError(null);
        
        const res = await fetch(
          `/api/opportunities/${opportunityId}/proposal-sections/${sectionId}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updates),
          }
        );
        
        if (!res.ok) throw new Error(`Update failed: ${res.status}`);
        
        // Optimistically update local state
        setSections(prev =>
          prev.map(s => s.id === sectionId ? { ...s, ...updates } : s)
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        throw err;
      }
    },
    [opportunityId, token]
  );
  
  // ... other action functions (mapRequirement, unmapRequirement, etc.)
  
  useEffect(() => {
    fetchSections();
  }, [fetchSections]);
  
  return {
    sections,
    statistics,
    loading,
    generating,
    error,
    fetchSections,
    generateSections,
    updateSection,
    mapRequirement,
    unmapRequirement,
    unmapAllRequirements,
    deleteSection,
    reorderSection,
  };
}
```

---

## Main Component: ProposalSectionEditor

**File:** `frontend/src/components/ProposalSectionEditor/ProposalSectionEditor.tsx` (~450 lines)

```typescript
interface Props {
  opportunityId: string;
  onSectionChange?: (sections: ProposalSection[]) => void;
}

export function ProposalSectionEditor({ opportunityId, onSectionChange }: Props) {
  const {
    sections,
    statistics,
    loading,
    generating,
    error,
    generateSections,
    ...actions
  } = useProposalSections(opportunityId);
  
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  
  const selectedSection = sections.find(s => s.id === selectedSectionId);
  
  useEffect(() => {
    onSectionChange?.(sections);
  }, [sections, onSectionChange]);
  
  const handleGenerate = async () => {
    try {
      await generateSections({
        autoMapRequirements: true,
        generateOutlines: true,
      });
    } catch (err) {
      alert(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };
  
  if (loading) {
    return <LoadingState />;
  }
  
  return (
    <div className="space-y-6">
      {error && <ErrorAlert message={error} />}
      
      <SectionGenerationPanel
        onGenerate={handleGenerate}
        isGenerating={generating}
        hasRequirements={statistics?.totalRequirements ?? 0 > 0}
        sectionsExist={sections.length > 0}
      />
      
      {statistics && (
        <StatisticsPanel statistics={statistics} />
      )}
      
      <div className="grid grid-cols-3 gap-6">
        {/* Left: Section List */}
        <div className="col-span-2">
          <SectionList
            sections={sections}
            selectedId={selectedSectionId}
            onSelect={setSelectedSectionId}
            onReorder={actions.reorderSection}
            onDelete={(id) => setShowDeleteConfirm(id)}
          />
        </div>
        
        {/* Right: Section Detail Panel */}
        <div className="col-span-1">
          {selectedSection ? (
            <SectionDetailPanel
              section={selectedSection}
              onUpdate={actions.updateSection}
              onMapRequirement={actions.mapRequirement}
              onUnmapRequirement={actions.unmapRequirement}
              onDelete={() => setShowDeleteConfirm(selectedSection.id)}
            />
          ) : (
            <EmptyStatePanel message="Select a section to edit" />
          )}
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          sectionId={showDeleteConfirm}
          onConfirm={async () => {
            await actions.deleteSection(showDeleteConfirm);
            setSelectedSectionId(null);
            setShowDeleteConfirm(null);
          }}
          onCancel={() => setShowDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
```

---

## Sub-Component: SectionGenerationPanel

**File:** `frontend/src/components/ProposalSectionEditor/SectionGenerationPanel.tsx` (~150 lines)

```typescript
interface Props {
  onGenerate: () => Promise<void>;
  isGenerating: boolean;
  hasRequirements: boolean;
  sectionsExist: boolean;
}

export function SectionGenerationPanel({
  onGenerate,
  isGenerating,
  hasRequirements,
  sectionsExist,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  
  const handleClick = () => {
    if (sectionsExist) {
      setShowConfirm(true); // Ask user to confirm regeneration
    } else {
      onGenerate();
    }
  };
  
  return (
    <div className="border rounded-lg p-6 bg-blue-50 border-blue-200">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-blue-900">Generate Proposal Sections</h3>
          <p className="text-sm text-blue-700 mt-1">
            {hasRequirements
              ? 'Create proposal sections from extracted RFP requirements'
              : 'Upload and extract RFP requirements first (Phase 1A)'}
          </p>
        </div>
        
        <button
          onClick={handleClick}
          disabled={!hasRequirements || isGenerating}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isGenerating && <Spinner />}
          {isGenerating ? 'Generating...' : 'Generate Sections'}
        </button>
      </div>
      
      {sectionsExist && (
        <p className="text-sm text-yellow-700 mt-3 p-2 bg-yellow-100 rounded">
          ⚠️ Sections already exist. Regenerating will replace them.
        </p>
      )}
      
      {showConfirm && (
        <ConfirmDialog
          message={`Regenerate ${sectionsExist ? 'existing' : 'new'} sections? This will replace your current sections.`}
          onConfirm={() => {
            onGenerate();
            setShowConfirm(false);
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
```

---

## Sub-Component: SectionList

**File:** `frontend/src/components/ProposalSectionEditor/SectionList.tsx` (~200 lines)

```typescript
interface Props {
  sections: ProposalSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (sectionId: string, newOrder: number) => Promise<void>;
  onDelete: (id: string) => void;
}

export function SectionList({
  sections,
  selectedId,
  onSelect,
  onReorder,
  onDelete,
}: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  
  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Allow drop
  };
  
  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    
    const draggedIndex = sections.findIndex(s => s.id === draggedId);
    const targetIndex = sections.findIndex(s => s.id === targetId);
    
    // Swap displayOrder
    const newOrder = sections[targetIndex].displayOrder;
    
    try {
      await onReorder(draggedId, newOrder);
    } catch (err) {
      alert(`Reordering failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    
    setDraggedId(null);
  };
  
  return (
    <div className="border rounded-lg p-6">
      <h3 className="text-lg font-bold mb-4">Proposal Sections</h3>
      
      {sections.length === 0 ? (
        <p className="text-gray-500">No sections created yet. Generate sections to start.</p>
      ) : (
        <div className="space-y-2">
          {sections.map(section => (
            <div
              key={section.id}
              draggable
              onDragStart={() => handleDragStart(section.id)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(section.id)}
              onClick={() => onSelect(section.id)}
              className={`
                p-4 border rounded cursor-pointer transition
                ${selectedId === section.id
                  ? 'bg-blue-50 border-blue-600 shadow-md'
                  : 'bg-white border-gray-300 hover:border-gray-400'
                }
                ${draggedId === section.id ? 'opacity-50' : ''}
              `}
            >
              <div className="flex items-center gap-3">
                <div className="text-gray-400 cursor-move">≡</div>
                
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{section.sectionName}</h4>
                  <p className="text-sm text-gray-600">{section.requirementCount} requirements</p>
                </div>
                
                <CoverageBadge status={section.coverageStatus} />
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(section.id);
                  }}
                  className="text-red-600 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CoverageBadge({ status }: { status: string }) {
  const colors = {
    UNCOVERED: 'bg-red-100 text-red-800',
    PARTIAL: 'bg-yellow-100 text-yellow-800',
    COVERED: 'bg-green-100 text-green-800',
  };
  
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors]}`}>
      {status}
    </span>
  );
}
```

---

## Sub-Component: SectionDetailPanel

**File:** `frontend/src/components/ProposalSectionEditor/SectionDetailPanel.tsx` (~300 lines)

**Features:**
- Edit section name, description, outline
- Show generation metadata
- Track manual edits (isCustom flag)
- Reset to AI-generated version
- Delete section button

```typescript
interface Props {
  section: ProposalSection;
  onUpdate: (sectionId: string, updates: Partial<ProposalSection>) => Promise<void>;
  onMapRequirement: (sectionId: string, reqId: string, weight: number) => Promise<void>;
  onUnmapRequirement: (sectionId: string, reqId: string) => Promise<void>;
  onDelete: () => void;
}

export function SectionDetailPanel({
  section,
  onUpdate,
  onMapRequirement,
  onUnmapRequirement,
  onDelete,
}: Props) {
  const [editName, setEditName] = useState(section.sectionName);
  const [editDesc, setEditDesc] = useState(section.sectionDescription || '');
  const [editOutline, setEditOutline] = useState(section.outlineText || '');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(section.id, {
        sectionName: editName,
        sectionDescription: editDesc,
        outlineText: editOutline,
      });
      setIsDirty(false);
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setSaving(false);
    }
  };
  
  const handleReset = () => {
    setEditName(section.sectionName);
    setEditDesc(section.sectionDescription || '');
    setEditOutline(section.outlineText || '');
    setIsDirty(false);
  };
  
  return (
    <div className="border rounded-lg p-6 sticky top-6">
      <h3 className="text-lg font-bold mb-4">Section Details</h3>
      
      {/* Section Name */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Section Name</label>
        <input
          type="text"
          value={editName}
          onChange={(e) => {
            setEditName(e.target.value);
            setIsDirty(true);
          }}
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
          maxLength={100}
        />
      </div>
      
      {/* Description */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={editDesc}
          onChange={(e) => {
            setEditDesc(e.target.value);
            setIsDirty(true);
          }}
          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          rows={2}
          maxLength={500}
        />
      </div>
      
      {/* Outline */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Outline</label>
        <textarea
          value={editOutline}
          onChange={(e) => {
            setEditOutline(e.target.value);
            setIsDirty(true);
          }}
          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          rows={5}
          maxLength={5000}
        />
        <p className="text-xs text-gray-500 mt-1">
          {editOutline.length}/5000 characters
        </p>
      </div>
      
      {/* Metadata */}
      {section.isCustom && (
        <p className="text-xs text-yellow-700 p-2 bg-yellow-100 rounded mb-4">
          ⚠️ This section has been customized by the user
        </p>
      )}
      
      {section.generatedAt && (
        <p className="text-xs text-gray-500 mb-4">
          Generated: {new Date(section.generatedAt).toLocaleDateString()}
        </p>
      )}
      
      {/* Actions */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={handleReset}
          disabled={!isDirty}
          className="px-3 py-2 border text-sm rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Reset
        </button>
      </div>
      
      {/* Delete */}
      <button
        onClick={onDelete}
        className="w-full px-3 py-2 text-red-600 border border-red-600 text-sm rounded hover:bg-red-50"
      >
        Delete Section
      </button>
      
      {/* Requirement Mapping */}
      <RequirementMapping
        sectionId={section.id}
        mappedRequirements={section.mappedRequirements || []}
        onMap={onMapRequirement}
        onUnmap={onUnmapRequirement}
      />
    </div>
  );
}
```

---

## Sub-Component: RequirementMapping

**File:** `frontend/src/components/ProposalSectionEditor/RequirementMapping.tsx` (~250 lines)

**Features:**
- Show mapped requirements
- Add requirement to section (dropdown)
- Adjust weight (1-5 slider)
- Remove requirement from section
- Drag-and-drop support (Phase 2)

```typescript
interface Props {
  sectionId: string;
  mappedRequirements: MappedRequirement[];
  onMap: (sectionId: string, reqId: string, weight: number) => Promise<void>;
  onUnmap: (sectionId: string, reqId: string) => Promise<void>;
}

export function RequirementMapping({
  sectionId,
  mappedRequirements,
  onMap,
  onUnmap,
}: Props) {
  const [allRequirements, setAllRequirements] = useState<MappedRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReqId, setSelectedReqId] = useState<string>('');
  const [mapping, setMapping] = useState(false);
  
  useEffect(() => {
    // Fetch all requirements for this opportunity
    // (would come from parent or via API)
  }, []);
  
  const unmappedRequirements = allRequirements.filter(
    req => !mappedRequirements.find(mr => mr.id === req.id)
  );
  
  const handleMap = async () => {
    if (!selectedReqId) return;
    
    setMapping(true);
    try {
      await onMap(sectionId, selectedReqId, 3); // default weight = 3
      setSelectedReqId('');
    } catch (err) {
      alert(`Mapping failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setMapping(false);
    }
  };
  
  return (
    <div className="mt-6 pt-6 border-t">
      <h4 className="font-semibold mb-4">Requirement Mapping</h4>
      
      {/* Add Requirement */}
      <div className="mb-4 p-3 bg-gray-50 rounded">
        <label className="text-sm font-medium block mb-2">Add Requirement</label>
        <div className="flex gap-2">
          <select
            value={selectedReqId}
            onChange={(e) => setSelectedReqId(e.target.value)}
            className="flex-1 px-3 py-2 border rounded text-sm"
          >
            <option value="">Select requirement...</option>
            {unmappedRequirements.map(req => (
              <option key={req.id} value={req.id}>
                {req.requirementText.substring(0, 50)}...
              </option>
            ))}
          </select>
          <button
            onClick={handleMap}
            disabled={!selectedReqId || mapping}
            className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {mapping ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
      
      {/* Mapped Requirements */}
      <div>
        <p className="text-sm font-medium mb-2">Mapped ({mappedRequirements.length})</p>
        {mappedRequirements.length === 0 ? (
          <p className="text-sm text-gray-500">No requirements mapped to this section</p>
        ) : (
          <div className="space-y-2">
            {mappedRequirements.map(req => (
              <div key={req.id} className="p-3 border rounded bg-white">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1">{req.requirementText}</p>
                  <button
                    onClick={() => onUnmap(sectionId, req.id)}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>
                
                {/* Weight Slider */}
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-gray-600">Weight:</label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={req.requirementWeight}
                    onChange={(e) => {
                      // Update weight (fire API call)
                    }}
                    className="flex-1"
                  />
                  <span className="text-xs font-medium">{req.requirementWeight}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Integration into OpportunityDetail

**File:** `frontend/src/pages/OpportunityDetail.tsx` (MODIFIED, +50 lines)

```typescript
import RequirementExtractionStatus from '../components/RequirementExtractionStatus';
import ProposalSectionEditor from '../components/ProposalSectionEditor/ProposalSectionEditor';

export function OpportunityDetailPage({ opportunityId }: PageProps) {
  const [tab, setTab] = useState<'requirements' | 'sections'>('requirements');
  const [requirementCount, setRequirementCount] = useState(0);
  
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Opportunity Details</h1>
      
      {/* Tab Navigation */}
      <div className="border-b mb-6">
        <button
          onClick={() => setTab('requirements')}
          className={`px-4 py-3 font-medium ${
            tab === 'requirements'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600'
          }`}
        >
          RFP Requirements (Phase 1A)
        </button>
        <button
          onClick={() => setTab('sections')}
          className={`px-4 py-3 font-medium ${
            tab === 'sections'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600'
          }`}
        >
          Proposal Sections (Phase 1B)
        </button>
      </div>
      
      {/* Tab Content */}
      {tab === 'requirements' && (
        <RequirementExtractionStatus
          opportunityId={opportunityId}
          onExtractionComplete={(count) => {
            setRequirementCount(count);
          }}
        />
      )}
      
      {tab === 'sections' && (
        <>
          {requirementCount === 0 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded mb-6">
              <p className="text-yellow-900 text-sm">
                ⚠️ No requirements extracted yet. Please extract requirements first using the RFP tab.
              </p>
            </div>
          )}
          
          <ProposalSectionEditor
            opportunityId={opportunityId}
            onSectionChange={(sections) => {
              // Could trigger other updates here
              console.log('Sections changed:', sections);
            }}
          />
        </>
      )}
    </div>
  );
}
```

---

## State Management

**Pattern: React Hooks + Custom Hooks**

No Redux/Zustand needed because:
- ✅ Component is mostly self-contained
- ✅ Parent (OpportunityDetail) doesn't need shared state
- ✅ useProposalSections hook handles all data fetching
- ✅ Sub-components use local state for UI (edit forms, etc.)
- ✅ Optimistic updates for better UX

**If complexity grows (Phase 2+):**
- Could extract to Zustand for global state
- But current scope doesn't require it

---

## Error Handling

**Component-level:**
- Try-catch around API calls
- Show alert to user on error
- Log to console for debugging

**Global error boundary:**
- Wrap ProposalSectionEditor in ErrorBoundary
- Fallback UI: "Something went wrong"
- Reset button to retry

```typescript
<ErrorBoundary fallback={<ErrorFallback />}>
  <ProposalSectionEditor opportunityId={opportunityId} />
</ErrorBoundary>
```

---

## Performance Optimizations

**Techniques:**
- ✅ Lazy load sections (fetch on tab click)
- ✅ useCallback for stable function references
- ✅ Memoize sub-components (React.memo) if needed
- ✅ Pagination for 100+ requirements
- ✅ Debounce search/filter inputs
- ✅ Virtual scrolling for large lists (Phase 2)

**Metrics:**
- Component render: < 200ms
- Initial load: < 500ms
- Drag-and-drop: 60fps smooth
- API response: < 500ms

---

## Accessibility

- ✅ Semantic HTML (button, input, select)
- ✅ ARIA labels for screen readers
- ✅ Keyboard navigation (Tab, Enter, Delete)
- ✅ Color + text for status indicators
- ✅ Focus states on interactive elements
- ✅ Loading states clearly communicated

---

## Testing Strategy

### Unit Tests
- `useProposalSections` hook (mocked API)
- Each sub-component (mocked props)
- Error handling paths

### Integration Tests
- Full flow: Generate → Edit → Map → Delete
- Drag-and-drop reordering
- Form validation
- Error states

### E2E Tests
- User journey from OpportunityDetail
- Generate sections from requirements
- Edit and save changes
- Verify persistence

---

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

**Fallbacks:**
- Drag-and-drop: Fallback to arrow buttons for mobile
- Tailwind: Works on all modern browsers

---

## Timeline

**Week 1 (Backend):**
- Schema design (done)
- API endpoints
- Integration tests

**Week 2 (Frontend):**
- Day 1-2: Components + custom hook
- Day 3: Integration into OpportunityDetail
- Day 4: E2E testing
- Day 5: Polish + deployment

**Total Frontend Effort:** ~40-50 hours (2 engineers × 2.5 days)

---

## Files Summary

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| ProposalSectionEditor.tsx | 450 | NEW | Main component |
| SectionGenerationPanel.tsx | 150 | NEW | Generate button + UI |
| SectionList.tsx | 200 | NEW | List + drag-to-reorder |
| SectionDetailPanel.tsx | 300 | NEW | Edit section details |
| RequirementMapping.tsx | 250 | NEW | Map requirements to sections |
| useProposalSections.ts | 200 | NEW | Custom hook for API calls |
| types/proposalSections.ts | 100 | NEW | TypeScript interfaces |
| OpportunityDetail.tsx | +50 | MODIFIED | Add tab navigation |
| **Total** | ~1,700 | | Complete frontend |

---

**Status:** Ready for implementation  
**Next:** Backend API implementation, then frontend development

