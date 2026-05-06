import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../utils/logger'
import { generateWithRouter } from './llm/llmRouter'
import { farGroundedComplete } from './far/farGroundedComplete'

const MATRIX_PROMPT = `You are a federal contracting compliance expert. Extract ALL distinct requirements from this government solicitation document (RFP/RFQ/IFB).

Focus on:
- Section L: Instructions to Offerors (what you must DO to submit)
- Section M: Evaluation Criteria (how you will be SCORED)
- Section H: Special Contract Requirements (FAR/DFARS clauses imposing obligations)
- Any numbered/lettered requirement anywhere in the document

Return ONLY a valid JSON array — no markdown, no preamble:
[
  {
    "section": "L.4.1",
    "sectionType": "INSTRUCTION",
    "requirementText": "Offerors shall submit a technical approach not to exceed 20 pages.",
    "isMandatory": true,
    "farReference": null
  }
]

sectionType must be one of:
- "INSTRUCTION" — how to prepare/submit proposal
- "EVALUATION" — how proposals will be graded/scored
- "CLAUSE" — FAR/DFARS or special clause imposing an obligation
- "CERTIFICATION" — certifications or representations required

isMandatory: true if uses "shall", "must", "required", "will"; false for "should", "may", "can".
farReference: FAR or DFARS clause number if cited (e.g. "FAR 52.219-9"), otherwise null.

Extract at least 8 requirements. If Section L/M are not explicitly labeled, extract key numbered or bulleted requirements.`

interface RawRequirement {
  section: string
  sectionType: string
  requirementText: string
  isMandatory: boolean
  farReference: string | null
}

export interface ParsedRequirement extends RawRequirement {
  sortOrder: number
}

export async function generateComplianceMatrix(
  text: string,
  opportunityTitle: string,
  opportunityId: string | null,
  consultingFirmId?: string | null
): Promise<ParsedRequirement[]> {
  const truncated = text.substring(0, 25000)
  const req = {
    systemPrompt: MATRIX_PROMPT,
    userPrompt: `Opportunity: ${opportunityTitle}\n\nDocument text:\n${truncated}`,
    maxTokens: 4000,
  }

  try {
    // FAR-grounded path: when opportunityId + tenant are known, every
    // inference inherits the regulatory frame and writes a replayable audit row.
    const llmResponse =
      opportunityId && consultingFirmId
        ? await farGroundedComplete(req, {
            scope: 'COMPLIANCE_MATRIX',
            opportunityId,
            consultingFirmId,
            task: 'COMPLIANCE_MATRIX',
            useCache: true,
          })
        : await generateWithRouter(req, consultingFirmId ?? undefined, {
            task: 'COMPLIANCE_MATRIX',
            useCache: true,
          })

    const parsed = parseResponse(llmResponse.text)
    if (parsed.length === 0) {
      logger.warn('LLM returned empty requirements — using generic fallback matrix', { opportunityTitle })
      return fallbackMatrix()
    }
    return parsed.map((r, i) => ({ ...r, sortOrder: i }))
  } catch (err) {
    const msg = (err as Error).message
    if (msg !== 'NO_LLM_KEY') {
      logger.error('Compliance matrix generation failed', { error: msg })
    }
    return fallbackMatrix()
  }
}

function parseResponse(raw: string): RawRequirement[] {
  try {
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start === -1 || end === -1) return []
    const arr = JSON.parse(cleaned.slice(start, end + 1))
    if (!Array.isArray(arr)) return []
    return arr
      .filter((r: any) => r.section && r.requirementText)
      .map((r: any) => ({
        section: String(r.section || 'General'),
        sectionType: ['INSTRUCTION', 'EVALUATION', 'CLAUSE', 'CERTIFICATION'].includes(r.sectionType)
          ? r.sectionType
          : 'INSTRUCTION',
        requirementText: String(r.requirementText || ''),
        isMandatory: r.isMandatory !== false,
        farReference: r.farReference ? String(r.farReference) : null,
      }))
  } catch {
    logger.warn('Failed to parse compliance matrix JSON')
    return []
  }
}

export async function extractTextFromDocument(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  try {
    if (ext === '.pdf') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse')
      const buffer = fs.readFileSync(filePath)
      const data = await pdfParse(buffer)
      return data.text || ''
    }
    if (ext === '.docx') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })
      return result.value || ''
    }
    if (ext === '.doc') {
      // Legacy .doc — attempt raw UTF-8 and strip non-printable chars
      const raw = fs.readFileSync(filePath, 'latin1')
      // Extract printable ASCII runs (length ≥ 4) — works for many older .doc files
      const printable = raw.match(/[ -~\r\n\t]{4,}/g)?.join(' ') ?? ''
      return printable
    }
    if (['.txt', '.md', '.rtf', '.csv'].includes(ext)) {
      return fs.readFileSync(filePath, 'utf-8')
    }
    // Unknown type — try UTF-8, return empty if it looks binary
    const raw = fs.readFileSync(filePath, 'utf-8')
    // Reject if more than 10% of chars are non-printable (binary file)
    const nonPrintable = (raw.match(/[^\x09\x0a\x0d\x20-\x7e]/g) || []).length
    if (nonPrintable / raw.length > 0.1) return ''
    return raw
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------
// Bid Guidance / Win Strategy
// ---------------------------------------------------------------

const GUIDANCE_PROMPT = `You are a federal contracting strategy expert. Analyze this government solicitation and produce a plain-language bid strategy guide for a small business pursing this contract.

Return ONLY valid JSON — no markdown, no preamble:
{
  "agencyWants": "2-3 sentence plain-language description of what the agency needs and why",
  "coreRequirements": ["top requirement 1", "top requirement 2"],
  "evaluationCriteria": [
    {
      "criterion": "Technical Approach",
      "relativeWeight": "high",
      "description": "what the evaluators are looking for",
      "winStrategy": "concrete advice to score well on this criterion"
    }
  ],
  "winningApproach": ["concrete strategic action 1", "concrete strategic action 2"],
  "redFlags": ["risk or obstacle to flag"],
  "keyDifferentiators": ["differentiator that would stand out to evaluators"],
  "submissionMustDos": ["critical must-do for the proposal response"]
}

relativeWeight must be one of: "high", "medium", "low".
evaluationCriteria: extract every criterion you can find; include Section M items explicitly.
winningApproach: 3–5 concrete, actionable items.
redFlags: things that could disqualify or weaken the bid.
keyDifferentiators: certifications, past performance angles, or technical strengths to emphasize.
submissionMustDos: compliance items that cannot be missed (page limits, certifications, formats).`

export interface EvaluationCriterion {
  criterion: string
  relativeWeight: 'high' | 'medium' | 'low'
  description: string
  winStrategy: string
}

export interface BidGuidance {
  agencyWants: string
  coreRequirements: string[]
  evaluationCriteria: EvaluationCriterion[]
  winningApproach: string[]
  redFlags: string[]
  keyDifferentiators: string[]
  submissionMustDos: string[]
}

export interface EnrichmentContext {
  historicalWinner?: string | null
  historicalAvgAward?: number | null
  historicalAwardCount?: number | null
  competitionCount?: number | null
  incumbentProbability?: number | null
  agencySmallBizRate?: number | null
  agencySdvosbRate?: number | null
  recompeteFlag?: boolean
  setAsideType?: string | null
  naicsCode?: string
  agency?: string
}

function buildEnrichmentBlock(ctx: EnrichmentContext): string {
  const lines: string[] = []
  if (ctx.agency) lines.push(`Agency: ${ctx.agency}`)
  if (ctx.naicsCode) lines.push(`NAICS Code: ${ctx.naicsCode}`)
  if (ctx.setAsideType) lines.push(`Set-Aside: ${ctx.setAsideType}`)
  if (ctx.recompeteFlag) lines.push(`Recompete: Yes — an incumbent contractor likely holds this work`)
  if (ctx.historicalWinner) lines.push(`Most Recent Winner: ${ctx.historicalWinner}`)
  if (ctx.historicalAvgAward != null) lines.push(`Historical Avg Award: $${Number(ctx.historicalAvgAward).toLocaleString()}`)
  if (ctx.historicalAwardCount != null) lines.push(`Times Competed (5yr): ${ctx.historicalAwardCount}`)
  if (ctx.competitionCount != null) lines.push(`Avg Competitors per Award: ${ctx.competitionCount}`)
  if (ctx.incumbentProbability != null) lines.push(`Incumbent Win Probability: ${Math.round(ctx.incumbentProbability * 100)}%`)
  if (ctx.agencySmallBizRate != null) lines.push(`Agency Small Biz Award Rate: ${Math.round(ctx.agencySmallBizRate * 100)}%`)
  if (ctx.agencySdvosbRate != null) lines.push(`Agency SDVOSB Award Rate: ${Math.round(ctx.agencySdvosbRate * 100)}%`)
  if (lines.length === 0) return ''
  return `\n\n=== USASpending Historical Intelligence ===\n${lines.join('\n')}\n\nUse this data to inform pricing anchors, incumbent risk, competitive positioning, and set-aside strategy.`
}

export async function generateBidGuidance(
  text: string,
  opportunityTitle: string,
  opportunityId: string | null,
  enrichment?: EnrichmentContext,
  consultingFirmId?: string | null
): Promise<BidGuidance | null> {
  const truncated = text.substring(0, 20000)
  const enrichmentBlock = enrichment ? buildEnrichmentBlock(enrichment) : ''
  const req = {
    systemPrompt: GUIDANCE_PROMPT,
    userPrompt: `Opportunity: ${opportunityTitle}${enrichmentBlock}\n\nSolicitation text:\n${truncated}`,
    maxTokens: 4000,
  }

  try {
    const llmResponse =
      opportunityId && consultingFirmId
        ? await farGroundedComplete(req, {
            scope: 'BID_GUIDANCE',
            opportunityId,
            consultingFirmId,
            task: 'BID_GUIDANCE',
            useCache: true,
          })
        : await generateWithRouter(req, consultingFirmId ?? undefined, {
            task: 'BID_GUIDANCE',
            useCache: true,
          })

    return parseBidGuidance(llmResponse.text)
  } catch (err) {
    const msg = (err as Error).message
    if (msg !== 'NO_LLM_KEY') {
      logger.error('Bid guidance generation failed', { error: msg })
    }
    return null
  }
}

function parseBidGuidance(raw: string): BidGuidance | null {
  try {
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    const obj = JSON.parse(cleaned.slice(start, end + 1))
    return {
      agencyWants: String(obj.agencyWants || ''),
      coreRequirements: Array.isArray(obj.coreRequirements) ? obj.coreRequirements.map(String) : [],
      evaluationCriteria: Array.isArray(obj.evaluationCriteria)
        ? obj.evaluationCriteria.map((c: any) => ({
            criterion: String(c.criterion || ''),
            relativeWeight: ['high', 'medium', 'low'].includes(c.relativeWeight) ? c.relativeWeight : 'medium',
            description: String(c.description || ''),
            winStrategy: String(c.winStrategy || ''),
          }))
        : [],
      winningApproach: Array.isArray(obj.winningApproach) ? obj.winningApproach.map(String) : [],
      redFlags: Array.isArray(obj.redFlags) ? obj.redFlags.map(String) : [],
      keyDifferentiators: Array.isArray(obj.keyDifferentiators) ? obj.keyDifferentiators.map(String) : [],
      submissionMustDos: Array.isArray(obj.submissionMustDos) ? obj.submissionMustDos.map(String) : [],
    }
  } catch {
    logger.warn('Failed to parse bid guidance JSON response')
    return null
  }
}

function fallbackMatrix(): ParsedRequirement[] {
  return [
    { section: 'L.1', sectionType: 'INSTRUCTION', requirementText: 'Submit a complete technical proposal addressing the Statement of Work.', isMandatory: true, farReference: null, sortOrder: 0 },
    { section: 'L.2', sectionType: 'INSTRUCTION', requirementText: 'Submit past performance references (minimum 3 relevant contracts within last 3 years).', isMandatory: true, farReference: null, sortOrder: 1 },
    { section: 'L.3', sectionType: 'INSTRUCTION', requirementText: 'Submit a price/cost volume with supporting calculations and basis of estimate.', isMandatory: true, farReference: null, sortOrder: 2 },
    { section: 'L.4', sectionType: 'CERTIFICATION', requirementText: 'Provide representations and certifications as required by FAR 52.212-3.', isMandatory: true, farReference: 'FAR 52.212-3', sortOrder: 3 },
    { section: 'M.1', sectionType: 'EVALUATION', requirementText: 'Technical approach evaluated on soundness, feasibility, and understanding of requirements.', isMandatory: true, farReference: null, sortOrder: 4 },
    { section: 'M.2', sectionType: 'EVALUATION', requirementText: 'Past performance evaluated on relevancy and recency.', isMandatory: true, farReference: null, sortOrder: 5 },
    { section: 'M.3', sectionType: 'EVALUATION', requirementText: 'Price/cost evaluated for reasonableness and realism.', isMandatory: true, farReference: null, sortOrder: 6 },
  ]
}
