import { generateWithRouter } from './llm/llmRouter'
import { farGroundedComplete } from './far/farGroundedComplete'
import { logger } from '../utils/logger'

export interface ProposalAnswer {
  questionId: string
  category: string
  question: string
  answer: string      // user-provided text, or empty string meaning "AI_FILL"
  aiDecide: boolean   // true = let AI fill in
}

export interface ProposalDraftSection {
  title: string
  content: string
}

export interface ProposalDraft {
  opportunityTitle: string
  agency: string
  preparedDate: string
  sections: ProposalDraftSection[]
}

const DRAFT_SYSTEM_PROMPT = `You are an expert federal proposal writer with 20+ years of experience winning government contracts. Write a complete, professional, submission-ready proposal response for the opportunity described.

CRITICAL REQUIREMENTS:
- Write ACTUAL proposal prose — not bullet points, not an outline, not placeholders.
- Every section must be fully written in formal government proposal style (first person plural: "Our team", "We propose", etc.).
- Each section MUST be comprehensive: 5–10 substantive paragraphs minimum.
- Reference specific requirements from the solicitation, the agency's mission, contract deliverables, and evaluation criteria.
- Include specific methodologies, tools, staffing plans, transition plans, and quality assurance approaches where relevant.
- Do NOT use placeholder text like [INSERT], [TBD], [COMPANY NAME], or similar. Fill in realistic, professional content throughout.
- The Technical Approach must describe a clear methodology, phases/tasks, tools/technologies, and deliverables.
- The Management Approach must include organizational structure, key personnel roles, communication plan, and risk mitigation.
- Past Performance must include realistic contract narratives with scope, outcomes, and relevance.

Return ONLY valid JSON — no markdown, no preamble:
{
  "sections": [
    {
      "title": "Cover Letter",
      "content": "Full written cover letter..."
    },
    {
      "title": "Executive Summary",
      "content": "Comprehensive executive summary — 2-3 pages worth of content covering understanding of requirements, proposed approach overview, key differentiators, and relevant experience..."
    },
    {
      "title": "Technical Approach",
      "content": "Detailed technical approach — 4-6 pages worth of content covering methodology, work breakdown, tools, technologies, deliverables, innovation, and compliance with SOW..."
    },
    {
      "title": "Management Approach",
      "content": "Detailed management approach — organizational chart description, key personnel, staffing plan, communication plan, risk management, quality assurance, transition plan..."
    },
    {
      "title": "Past Performance",
      "content": "3+ detailed past performance narratives with contract name, agency, period, value, scope, outcomes, and relevance to this opportunity..."
    },
    {
      "title": "Staffing Plan",
      "content": "Key personnel qualifications, organizational structure, labor categories, recruitment and retention approach..."
    },
    {
      "title": "Price/Cost Approach",
      "content": "Pricing methodology, cost reasonableness narrative, value proposition, cost control measures..."
    }
  ]
}`

function buildAnswersBlock(answers: ProposalAnswer[]): string {
  if (!answers.length) return ''
  const lines = answers.map(a => {
    const label = a.category.replace(/_/g, ' ')
    if (a.aiDecide || !a.answer.trim()) {
      return `[AI_FILL] ${label}: Use your best judgment based on the opportunity context`
    }
    return `${label}: ${a.answer.trim()}`
  })
  return `\n=== PROPOSAL INTERVIEW ANSWERS (incorporate directly into the proposal) ===\n${lines.join('\n')}\n===\n`
}

export async function generateProposalDraft(
  opportunityTitle: string,
  agency: string,
  requirements: Array<{ section: string; requirementText: string; isMandatory: boolean }>,
  enrichment: {
    naicsCode?: string
    setAsideType?: string | null
    estimatedValue?: number | null
    historicalWinner?: string | null
    description?: string | null
  },
  consultingFirmId: string,
  answers: ProposalAnswer[] = [],
  userGuidance?: string,
  bidFormContext?: string,
  opportunityId: string | null = null,
): Promise<ProposalDraft> {
  const mandatoryReqs = requirements
    .filter(r => r.isMandatory)
    .slice(0, 20)
    .map(r => `[${r.section}] ${r.requirementText.slice(0, 300)}`)
    .join('\n')

  const allReqs = requirements
    .slice(0, 30)
    .map(r => `[${r.section}] ${r.requirementText.slice(0, 200)}`)
    .join('\n')

  const answersBlock = buildAnswersBlock(answers)

  const userPrompt = `Write a complete proposal for this federal opportunity.

Opportunity: ${opportunityTitle}
Agency: ${agency}
NAICS Code: ${enrichment.naicsCode ?? 'Not specified'}
Set-Aside: ${enrichment.setAsideType ?? 'Open competition'}
Estimated Contract Value: ${enrichment.estimatedValue ? '$' + Number(enrichment.estimatedValue).toLocaleString() : 'Not published'}
Incumbent/Historical Winner: ${enrichment.historicalWinner ?? 'Unknown'}
${answersBlock}${userGuidance ? `\n=== ADDITIONAL PROPOSAL MANAGER GUIDANCE ===\n${userGuidance}\n===\n` : ''}${bidFormContext ? `\n=== UPLOADED BID FORM DATA (incorporate fields/requirements into pricing and technical sections) ===\n${bidFormContext}\n===\n` : ''}
${enrichment.description ? `Opportunity Description:\n${enrichment.description.slice(0, 2000)}\n` : ''}

Mandatory Requirements to Address:
${mandatoryReqs || 'No requirements extracted — write based on the opportunity description.'}

All Requirements:
${allReqs || 'See mandatory requirements above.'}

Write a COMPLETE, COMPREHENSIVE, SUBMISSION-READY proposal draft. This must read like a real federal proposal that could win a contract.
- Executive Summary: 2-3 pages of content. Cover understanding of the agency mission, summary of approach, team qualifications, and why the offeror is uniquely qualified.
- Technical Approach: 4-6 pages. Detailed methodology, phased approach with tasks/milestones, specific tools and technologies, deliverables per phase, innovation, and direct traceability to SOW requirements.
- Management Approach: 2-3 pages. Org chart narrative, key personnel with roles, communication cadence, risk register and mitigation strategies, quality control plan, transition approach.
- Past Performance: 2-3 pages. At least 3 detailed contract narratives — include realistic contract names, agency, performance period, dollar value, scope description, quantified outcomes, and direct relevance to this requirement.
- Staffing Plan: 1-2 pages. Labor categories, full-time equivalents, key personnel bios, recruitment strategy.
- Price/Cost Approach: 1-2 pages. Pricing philosophy, cost realism narrative, value proposition, cost control and monitoring.

Each section MUST be fully written prose. No placeholders, no bullet-point outlines, no [INSERT] markers.`

  let response
  // Note: maxTokens 32000 + timeoutMs 600000 are the prod fixes from
  // 6e02f4e9 ("timeout was killing Claude mid-generation") — large
  // drafts take 3-5 minutes on Claude. Both the FAR-grounded and
  // direct-router paths inherit them.
  const llmReq = {
    systemPrompt: DRAFT_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 32000,
    temperature: 0.3,
    timeoutMs: 600_000,
  }
  try {
    response = opportunityId
      ? await farGroundedComplete(llmReq, {
          scope: 'PROPOSAL_DRAFT',
          opportunityId,
          consultingFirmId,
          task: 'PROPOSAL_DRAFT',
          useCache: false,
        })
      : await generateWithRouter(llmReq, consultingFirmId, {
          task: 'PROPOSAL_DRAFT',
          useCache: false,
        })
  } catch (err) {
    const msg = (err as Error).message
    // Re-throw key/rate errors so the route can handle them with proper HTTP codes
    if (msg === 'NO_LLM_KEY' || msg === 'RATE_LIMITED') throw err
    // Timeout / abort / network — surface as EMPTY_LLM_OUTPUT so the route
    // returns 502 and refunds the token charge. Previously we returned a
    // 1-section "Notice" stub which silently produced a near-blank PDF.
    logger.error('Proposal draft generation failed', { error: msg })
    throw new Error('EMPTY_LLM_OUTPUT')
  }

  const sections = parseDraftResponse(response.text)
  const hasUsableContent = sections.some(s => s.content && s.content.trim().length > 50)
  if (!hasUsableContent) {
    logger.error('Proposal draft LLM returned no usable content', {
      rawLength: response.text?.length ?? 0,
      sectionCount: sections.length,
    })
    throw new Error('EMPTY_LLM_OUTPUT')
  }

  return {
    opportunityTitle,
    agency,
    preparedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    sections,
  }
}

function parseDraftResponse(raw: string): ProposalDraftSection[] {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
  const start = cleaned.indexOf('{')
  if (start === -1) {
    logger.warn('Proposal draft response had no JSON object', { rawLength: raw.length })
    return []
  }

  // Fast path: complete, valid JSON
  const end = cleaned.lastIndexOf('}')
  if (end !== -1) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1))
      if (Array.isArray(obj.sections)) {
        const sections = obj.sections
          .filter((s: any) => s.title && s.content)
          .map((s: any) => ({ title: String(s.title), content: String(s.content) }))
        if (sections.length) return sections
      }
    } catch {
      // Fall through to truncation recovery
    }
  }

  // Truncation recovery: scan for completed {"title": "...", "content": "..."} objects.
  // When Claude hits max_tokens mid-section, the trailing object is malformed but
  // earlier sections are intact. Returning those is far better than dumping raw
  // truncated JSON into a single PDF section.
  const recovered = recoverCompleteSections(cleaned.slice(start))
  if (recovered.length) {
    logger.warn('Proposal draft JSON was truncated; recovered complete sections', {
      recoveredCount: recovered.length,
      rawLength: raw.length,
    })
    return recovered
  }

  logger.error('Proposal draft response could not be parsed or recovered', { rawLength: raw.length })
  return []
}

function recoverCompleteSections(text: string): ProposalDraftSection[] {
  const sections: ProposalDraftSection[] = []
  let i = 0
  while (i < text.length) {
    const titleKey = text.indexOf('"title"', i)
    if (titleKey === -1) break
    const title = readJsonStringValue(text, titleKey + '"title"'.length)
    if (!title) { i = titleKey + 1; continue }
    const contentKey = text.indexOf('"content"', title.endIndex)
    if (contentKey === -1) break
    const content = readJsonStringValue(text, contentKey + '"content"'.length)
    if (!content) { i = title.endIndex; continue }
    if (title.value.trim() && content.value.trim().length > 50) {
      sections.push({ title: title.value, content: content.value })
    }
    i = content.endIndex
  }
  return sections
}

function readJsonStringValue(text: string, from: number): { value: string; endIndex: number } | null {
  let j = from
  while (j < text.length && text[j] !== '"') {
    if (text[j] !== ' ' && text[j] !== ':' && text[j] !== '\t' && text[j] !== '\n' && text[j] !== '\r') return null
    j++
  }
  if (j >= text.length) return null
  const startQuote = j
  j++
  let out = ''
  while (j < text.length) {
    const ch = text[j]
    if (ch === '\\') {
      const next = text[j + 1]
      if (next === undefined) return null
      if (next === 'n') out += '\n'
      else if (next === 't') out += '\t'
      else if (next === 'r') out += '\r'
      else if (next === '"') out += '"'
      else if (next === '\\') out += '\\'
      else if (next === '/') out += '/'
      else if (next === 'u' && j + 5 < text.length) {
        const hex = text.slice(j + 2, j + 6)
        const code = parseInt(hex, 16)
        if (!Number.isNaN(code)) out += String.fromCharCode(code)
        j += 4
      } else {
        out += next
      }
      j += 2
      continue
    }
    if (ch === '"') return { value: out, endIndex: j + 1 }
    out += ch
    j++
  }
  return null
}
