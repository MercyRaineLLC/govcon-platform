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

const DRAFT_SYSTEM_PROMPT = `You are an expert federal proposal writer with 20+ years of experience winning government contracts. Write a complete, professional proposal response for the opportunity described.

Write ACTUAL proposal prose — not bullet points, not an outline, not placeholders. Every section must be fully written in a formal government proposal style (first person plural "Our team", "We propose", etc.).

Return ONLY valid JSON — no markdown, no preamble:
{
  "sections": [
    {
      "title": "Cover Letter",
      "content": "Full written cover letter text..."
    },
    {
      "title": "Executive Summary",
      "content": "Full written executive summary..."
    },
    {
      "title": "Technical Approach",
      "content": "Full written technical approach section..."
    },
    {
      "title": "Management Approach",
      "content": "Full written management section..."
    },
    {
      "title": "Past Performance",
      "content": "Full written past performance narrative..."
    },
    {
      "title": "Price/Cost Approach",
      "content": "Full written pricing narrative..."
    }
  ]
}

Each section content must be 3–6 paragraphs of real, substantive proposal prose that directly addresses the requirements. Reference specific requirements, agency mission, and technical details from the solicitation. Do not use placeholder text like [INSERT] or TBD.`

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

Write a complete, submission-ready proposal draft. Each section should be substantive, specific to this opportunity, and address the actual requirements listed above.`

  let response
  try {
    response = await generateWithRouter(
      {
        systemPrompt: DRAFT_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 8000,
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
