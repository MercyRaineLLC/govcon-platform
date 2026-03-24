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
  consultingFirmId: string
): Promise<ProposalOutline> {
  const reqSummary = requirements
    .filter(r => r.isMandatory)
    .slice(0, 20)
    .map(r => `- [${r.section}] ${r.requirementText}`)
    .join('\n')

  const systemPrompt = `You are an expert federal proposal writer. Generate a structured proposal outline that directly addresses the stated requirements. Be specific, practical, and focused on winning. Output valid JSON only — no markdown, no explanation.`

  const userPrompt = `Generate a proposal outline for this federal opportunity.

Opportunity: ${opportunityTitle}
Agency: ${agency}
NAICS: ${enrichment.naicsCode ?? 'Not specified'}
Set-Aside: ${enrichment.setAsideType ?? 'None'}
Estimated Value: ${enrichment.estimatedValue ? '$' + enrichment.estimatedValue.toLocaleString() : 'Not published'}
Historical Winner: ${enrichment.historicalWinner ?? 'Unknown'}

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

  const response = await generateWithRouter(
    { systemPrompt, userPrompt, maxTokens: 2000, temperature: 0.2 },
    consultingFirmId,
    { task: 'BID_GUIDANCE', useCache: false }
  )

  try {
    const cleaned = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as ProposalOutline
  } catch {
    // Return graceful fallback if parse fails
    return {
      executiveSummary: response.text.substring(0, 300),
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
