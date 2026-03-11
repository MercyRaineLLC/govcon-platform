import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../utils/logger'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

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
  opportunityTitle: string
): Promise<ParsedRequirement[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    logger.warn('ANTHROPIC_API_KEY not set — returning shell compliance matrix')
    return fallbackMatrix()
  }

  const truncated = text.substring(0, 60000)

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: `${MATRIX_PROMPT}\n\nOpportunity: ${opportunityTitle}\n\nDocument text:\n${truncated}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      logger.error('Claude API error in matrix generation', { status: response.status, body: errText })
      return fallbackMatrix()
    }

    const data = (await response.json()) as any
    const rawText: string =
      data.content
        ?.filter((b: any) => b.type === 'text')
        ?.map((b: any) => b.text)
        ?.join('') || ''

    const parsed = parseResponse(rawText)
    return parsed.map((r, i) => ({ ...r, sortOrder: i }))
  } catch (err) {
    logger.error('Compliance matrix generation failed', { error: (err as Error).message })
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
    logger.warn('Failed to parse compliance matrix JSON response')
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
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return ''
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
