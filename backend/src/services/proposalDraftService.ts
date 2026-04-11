import { generateWithRouter } from './llm/llmRouter'
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
  bidFormContext?: string
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
  try {
    response = await generateWithRouter(
      {
        systemPrompt: DRAFT_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 16000,
        temperature: 0.3,
      },
      consultingFirmId,
      { task: 'BID_GUIDANCE', useCache: false }
    )
  } catch (err) {
    const msg = (err as Error).message
    // Re-throw key/rate errors so the route can handle them with proper HTTP codes
    if (msg === 'NO_LLM_KEY' || msg === 'RATE_LIMITED') throw err
    // Timeout or other transient LLM errors — return a skeleton draft
    logger.error('Proposal draft generation failed', { error: msg })
    return {
      opportunityTitle,
      agency,
      preparedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      sections: [
        {
          title: 'Notice',
          content: 'The AI proposal draft could not be generated at this time (the request timed out or the AI service is temporarily unavailable). Please try again in a few moments. If the problem persists, verify your AI provider settings in Settings → AI Intelligence Provider.',
        },
      ],
    }
  }

  const sections = parseDraftResponse(response.text)

  return {
    opportunityTitle,
    agency,
    preparedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    sections,
  }
}

function parseDraftResponse(raw: string): ProposalDraftSection[] {
  try {
    const cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON found')
    const obj = JSON.parse(cleaned.slice(start, end + 1))
    if (!Array.isArray(obj.sections)) throw new Error('No sections array')
    return obj.sections
      .filter((s: any) => s.title && s.content)
      .map((s: any) => ({ title: String(s.title), content: String(s.content) }))
  } catch (e) {
    logger.warn('Failed to parse proposal draft JSON, attempting text extraction', { error: (e as Error).message })
    // Fallback: try to extract sections from raw text
    return [{ title: 'Proposal Draft', content: raw.slice(0, 10000) }]
  }
}
