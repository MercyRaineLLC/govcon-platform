import { generateWithRouter } from './llm/llmRouter'

export interface ProposalOutline {
  executiveSummary: string
  winThemes: string[]
  sections: Array<{
    title: string
    description: string
    keyPoints: string[]
    pageEstimate: string
  }>
  discriminators: string[]
  riskMitigations: string[]
  pastPerformanceHint: string
}

export async function generateProposalOutline(
  opportunityTitle: string,
  agency: string,
  requirements: Array<{ section: string; requirementText: string; isMandatory: boolean }>,
  enrichment: { naicsCode?: string; setAsideType?: string | null; estimatedValue?: number | null; historicalWinner?: string | null },
  consultingFirmId: string,
  userGuidance?: string
): Promise<ProposalOutline> {
  // Keep top 12 mandatory requirements to stay well under token limits
  const reqSummary = requirements
    .filter(r => r.isMandatory)
    .slice(0, 12)
    .map(r => `- [${r.section}] ${r.requirementText.slice(0, 200)}`)
    .join('\n')

  const systemPrompt = `You are an expert federal proposal writer. Generate a structured proposal outline that directly addresses the stated requirements. Be specific, practical, and focused on winning. Output valid JSON only — no markdown, no explanation.`

  const userPrompt = `Generate a proposal outline for this federal opportunity.

Opportunity: ${opportunityTitle}
Agency: ${agency}
NAICS: ${enrichment.naicsCode ?? 'Not specified'}
Set-Aside: ${enrichment.setAsideType ?? 'None'}
Estimated Value: ${enrichment.estimatedValue ? '$' + enrichment.estimatedValue.toLocaleString() : 'Not published'}
Historical Winner: ${enrichment.historicalWinner ?? 'Unknown'}
${userGuidance ? `\nAdditional Guidance from Proposal Manager:\n${userGuidance}\n` : ''}
Mandatory Requirements:
${reqSummary || 'No requirements extracted yet — use opportunity description'}

Return this exact JSON structure:
{
  "executiveSummary": "2-3 sentence winning executive summary approach",
  "winThemes": ["theme1", "theme2", "theme3"],
  "sections": [
    {
      "title": "Section name",
      "description": "What this section covers",
      "keyPoints": ["point1", "point2"],
      "pageEstimate": "X-Y pages"
    }
  ],
  "discriminators": ["what sets your firm apart for this specific opportunity"],
  "riskMitigations": ["risks to address proactively"],
  "pastPerformanceHint": "What past performance to highlight"
}`

  let response
  try {
    response = await generateWithRouter(
      { systemPrompt, userPrompt, maxTokens: 2000, temperature: 0.2 },
      consultingFirmId,
      { task: 'BID_GUIDANCE', useCache: false }
    )
  } catch (llmErr) {
    const msg = (llmErr as Error).message
    // Re-throw errors the route handler needs to handle specially
    if (msg === 'NO_LLM_KEY' || msg === 'RATE_LIMITED') throw llmErr
    // All other LLM errors (API auth, network, timeout) return the graceful fallback
    return {
      executiveSummary: 'AI outline generation is temporarily unavailable. Please try again in a moment.',
      winThemes: ['Technical Excellence', 'Past Performance', 'Management Approach'],
      sections: [
        { title: 'Technical Approach', description: 'Detailed methodology addressing solicitation requirements', keyPoints: ['Core capability', 'Innovation'], pageEstimate: '10-15 pages' },
        { title: 'Management Approach', description: 'Team structure and oversight plan', keyPoints: ['Key Personnel', 'Quality Control'], pageEstimate: '5-8 pages' },
        { title: 'Past Performance', description: 'Relevant prior contracts demonstrating capability', keyPoints: ['Similar scope', 'Measurable outcomes'], pageEstimate: '3-5 pages' },
      ],
      discriminators: ['Specialized expertise in the required NAICS area'],
      riskMitigations: ['Identify and address evaluation risks proactively'],
      pastPerformanceHint: 'Highlight contracts with similar agency, scope, and dollar value',
    }
  }

  try {
    // Strip markdown code fences, then find the first complete JSON object
    const stripped = response.text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()
    // Extract JSON from first { to last }
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON object found')
    const jsonStr = stripped.slice(start, end + 1)
    return JSON.parse(jsonStr) as ProposalOutline
  } catch {
    // Return graceful fallback if parse fails
    return {
      executiveSummary: 'AI-powered outline generation requires a valid AI key and response. Please verify your AI provider settings and try again.',
      winThemes: ['Technical Excellence', 'Past Performance', 'Management Approach'],
      sections: [
        { title: 'Technical Approach', description: 'Detailed methodology', keyPoints: ['Capability', 'Innovation'], pageEstimate: '10-15 pages' },
        { title: 'Management Approach', description: 'Team structure and oversight', keyPoints: ['Key Personnel', 'Quality Control'], pageEstimate: '5-8 pages' },
        { title: 'Past Performance', description: 'Relevant contracts', keyPoints: ['Similar scope', 'Measurable results'], pageEstimate: '3-5 pages' },
      ],
      discriminators: ['Specialized expertise in the required NAICS area'],
      riskMitigations: ['Identify and address evaluation risks early'],
      pastPerformanceHint: 'Highlight contracts with similar agency and dollar value',
    }
  }
}
