// =============================================================
// Shared Types and Interfaces
// =============================================================
import { Request } from 'express';

// -------------------------------------------------------------
// Auth
// -------------------------------------------------------------
export interface JwtPayload {
  userId: string;
  consultingFirmId: string;
  role: 'ADMIN' | 'CONSULTANT';
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// -------------------------------------------------------------
// Deadline Priority
// -------------------------------------------------------------
export type DeadlinePriority = 'RED' | 'YELLOW' | 'GREEN';

export interface DeadlineClassification {
  priority: DeadlinePriority;
  daysUntilDeadline: number;
  label: string;
}

// -------------------------------------------------------------
// Probability Engine — 7-factor model (set-aside moved to compliance gate)
// -------------------------------------------------------------
export interface ProbabilityFeatures {
  naicsOverlapScore: number;        // 0-1: NAICS domain match
  agencyAlignmentScore: number;     // 0-1: Historical agency award rate
  awardSizeFitScore: number;        // 0-1: Contract size within client capacity
  competitionDensityScore: number;  // 0-1: Fewer competitors = higher score
  historicalDistribution: number;   // 0-1: USAspending base win rate
  incumbentWeaknessScore: number;   // 0-1: Inverse of incumbent dominance
  documentAlignmentScore: number;   // 0-1: SOW scope match from document intel
}

// -------------------------------------------------------------
// Compliance Gate — Layer 1: Hard eligibility filter
// -------------------------------------------------------------
export type ComplianceGate = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE'

export interface ComplianceGateOutput {
  gate: ComplianceGate
  blockers: string[]     // Hard ineligibility reasons
  conditions: string[]   // Soft warnings
  requiredActions: string[]
}

// -------------------------------------------------------------
// Fit Score — Layer 2: Client capability (0-100)
// -------------------------------------------------------------
export interface FitScoreOutput {
  total: number
  breakdown: {
    naicsDepth: number
    pastPerformance: number
    capacityFit: number
    geographicFit: number
    resourceReadiness: number
    financialStrength: number
  }
}

// -------------------------------------------------------------
// Market Score — Layer 3: Opportunity attractiveness (0-100)
// -------------------------------------------------------------
export interface MarketScoreOutput {
  total: number
  breakdown: {
    competitionDensity: number
    incumbentStrength: number
    contractValueFit: number
    agencyBuyingPatterns: number
    timingAdvantage: number
  }
}

export interface ProbabilityResult {
  features: ProbabilityFeatures;
  rawScore: number;
  probability: number;
  expectedValue: number;
}

// -------------------------------------------------------------
// USASpending Enrichment
// -------------------------------------------------------------
export interface AwardRecord {
  recipientName: string;
  recipientUei?: string;
  awardAmount: number;
  awardDate: string;
  baseAndAllOptions?: number;
  awardType?: string;
  contractNumber?: string;
}

export interface EnrichmentResult {
  historicalWinner: string | null;
  historicalAvgAward: number;
  historicalAwardCount: number;
  competitionCount: number | null;    // null = no historical data found
  incumbentProbability: number | null; // null = no historical data found
  agencySmallBizRate: number;
  agencySdvosbRate: number;
  recompeteFlag: boolean;
  awards: AwardRecord[];
  offersReceived: number | null;      // FPDS: actual bidder count per solicitation
  extentCompeted: string | null;      // FPDS: competition extent
}

// -------------------------------------------------------------
// Document Analysis
// -------------------------------------------------------------
export interface DocumentAnalysisResult {
  scopeKeywords: string[];
  complexityScore: number;
  alignmentScore: number;
  incumbentSignals: string[];
  rawAnalysis: Record<string, unknown>;
}

// -------------------------------------------------------------
// Job System
// -------------------------------------------------------------
export type JobType = 'INGEST' | 'ENRICH' | 'ANALYZE_DOCUMENT';
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED';

export interface JobResult {
  id: string;
  type: JobType;
  status: JobStatus;
  opportunitiesFound?: number;
  opportunitiesNew?: number;
  enrichedCount?: number;
  scoringJobsQueued?: number;
  errors?: number;
  errorDetail?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// -------------------------------------------------------------
// SAM.gov API
// -------------------------------------------------------------
export interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  organizationHierarchy?: {
    agency?: string;
    subagency?: string;
    office?: string;
  };
  naicsCode?: string;
  naicsDescription?: string;
  classificationCode?: string;
  setAside?: string;
  typeOfSetAside?: string;
  estimatedValue?: {
    amount?: number;
    minAmount?: number;
    maxAmount?: number;
  };
  postedDate?: string;
  responseDeadLine?: string;
  archiveDate?: string;
  placeOfPerformance?: {
    city?: string;
    state?: string;
  };
  description?: string;
  uiLink?: string;
}

// -------------------------------------------------------------
// Opportunity Filters
// -------------------------------------------------------------
export interface OpportunityFilters {
  naicsCode?: string;
  agency?: string;
  marketCategory?: string;
  setAsideType?: string;
  estimatedValueMin?: number;
  estimatedValueMax?: number;
  daysUntilDeadline?: number;
  probabilityMin?: number;
  probabilityMax?: number;
  status?: string;
  sortBy?: 'deadline' | 'probability' | 'expectedValue' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// -------------------------------------------------------------
// Performance Metrics
// -------------------------------------------------------------
export interface FirmMetrics {
  totalClients: number;
  totalSubmissions: number;
  aggregateCompletionRate: number;
  totalPenaltiesGenerated: number;
}

// -------------------------------------------------------------
// API Response Envelope
// -------------------------------------------------------------
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}
