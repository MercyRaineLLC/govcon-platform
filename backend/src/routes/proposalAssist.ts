import { Router, Response, NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { prisma } from '../config/database'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { AuthenticatedRequest } from '../types'
import { NotFoundError } from '../utils/errors'
import { generateProposalOutline } from '../services/proposalAssist'
import { generateProposalDraft, ProposalAnswer } from '../services/proposalDraftService'
import { buildProposalPdf } from '../services/proposalPdfBuilder'
import { checkAiCallLimit, checkProposalTokens, deductProposalTokens } from '../middleware/tierGate'
import { generateWithRouter } from '../services/llm/llmRouter'
import { logger } from '../utils/logger'
import { upload } from '../middleware/upload'
import { DocumentAnalysisService } from '../services/documentAnalysis'

const docAnalysisService = new DocumentAnalysisService()

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// ---------------------------------------------------------------
// POST /api/proposal-assist/:opportunityId/outline  (costs 1 token)
// ---------------------------------------------------------------
router.post('/:opportunityId/outline', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    logger.info('Proposal outline requested', { opportunityId: req.params.opportunityId, consultingFirmId })

    const aiCheck = await checkAiCallLimit(consultingFirmId)
    if (!aiCheck.allowed) {
      return res.status(403).json({ error: 'AI_LIMIT', message: `AI call limit reached (${aiCheck.current}/${aiCheck.max} this month).` })
    }

    const tokenCheck = await checkProposalTokens(consultingFirmId, 1)
    if (!tokenCheck.allowed) {
      return res.status(402).json({
        error: 'NO_TOKENS',
        message: 'You have no proposal tokens remaining. Purchase more in Billing → Proposal Token Packs.',
        balance: tokenCheck.balance,
      })
    }

    const { opportunityId } = req.params

    const [opp, matrix] = await Promise.all([
      prisma.opportunity.findFirst({
        where: { id: opportunityId, consultingFirmId },
        select: { id: true, title: true, agency: true, naicsCode: true, setAsideType: true, estimatedValue: true, historicalWinner: true },
      }),
      prisma.complianceMatrix.findUnique({
        where: { opportunityId },
        include: { requirements: { orderBy: { sortOrder: 'asc' }, take: 30 } },
      }),
    ])

    if (!opp) throw new NotFoundError('Opportunity')

    const requirements = (matrix?.requirements ?? []).map(r => ({
      section: r.section,
      requirementText: r.requirementText,
      isMandatory: r.isMandatory,
    }))

    const userGuidance: string | undefined = typeof req.body?.userGuidance === 'string' && req.body.userGuidance.trim()
      ? req.body.userGuidance.trim().slice(0, 3000)
      : undefined

    const outline = await generateProposalOutline(
      opp.title,
      opp.agency,
      requirements,
      {
        naicsCode: opp.naicsCode ?? undefined,
        setAsideType: opp.setAsideType,
        estimatedValue: opp.estimatedValue ? Number(opp.estimatedValue) : null,
        historicalWinner: opp.historicalWinner,
      },
      consultingFirmId,
      userGuidance
    )

    const tokensRemaining = await deductProposalTokens(consultingFirmId, 1)
    res.json({ success: true, data: outline, tokensRemaining })
  } catch (err: any) {
    if (err?.message === 'NO_LLM_KEY') {
      return res.status(400).json({ error: 'NO_AI_KEY', message: 'No AI key configured — go to Settings to add your API key.' })
    }
    if (err?.message === 'RATE_LIMITED') {
      return res.status(429).json({ error: 'RATE_LIMITED', message: 'AI rate limit reached — please wait 60 seconds and try again.' })
    }
    next(err)
  }
})

// ---------------------------------------------------------------
// POST /api/proposal-assist/:opportunityId/questions  (free — 0 tokens)
// Accepts: { outline: ProposalOutline }
// Returns: ProposalQuestion[]
// ---------------------------------------------------------------
router.post('/:opportunityId/questions', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { opportunityId } = req.params
    const { outline } = req.body

    const opp = await prisma.opportunity.findFirst({
      where: { id: opportunityId, consultingFirmId },
      select: { title: true, agency: true, naicsCode: true, setAsideType: true, estimatedValue: true, description: true },
    })
    if (!opp) throw new NotFoundError('Opportunity')

    const winThemes = Array.isArray(outline?.winThemes) ? outline.winThemes.slice(0, 5).join(', ') : ''
    const sections = Array.isArray(outline?.sections)
      ? outline.sections.map((s: any) => s.title).join(', ')
      : ''

    const systemPrompt = `You are a senior federal proposal manager conducting a pre-proposal interview. Generate targeted questions that will help write a stronger, winning proposal for this specific opportunity. Focus on information the AI cannot know: exact pricing, key personnel, past contracts, teaming partners, certifications, and technical differentiators.

Return ONLY a valid JSON array — no markdown, no preamble:
[
  {
    "id": "q1",
    "category": "PRICING",
    "question": "What is your proposed total contract price and how is it structured?",
    "hint": "e.g., $2.4M total: $1.8M labor, $400K ODC, 10% fee",
    "required": true
  }
]

category must be one of: PRICING, TECHNICAL, PERSONNEL, PAST_PERFORMANCE, TEAMING, CERTIFICATIONS, OTHER
required: true for questions that significantly improve proposal quality, false for nice-to-have.
Generate 7-9 questions. Mix required (4-5) and optional (2-4).`

    const userPrompt = `Generate proposal interview questions for this opportunity.

Opportunity: ${opp.title}
Agency: ${opp.agency}
NAICS: ${opp.naicsCode ?? 'Not specified'}
Set-Aside: ${opp.setAsideType ?? 'Open competition'}
Estimated Value: ${opp.estimatedValue ? '$' + Number(opp.estimatedValue).toLocaleString() : 'Not published'}
Win Themes: ${winThemes || 'Not yet defined'}
Proposed Sections: ${sections || 'Standard proposal sections'}
${opp.description ? `\nOpportunity Description:\n${opp.description.slice(0, 1000)}` : ''}`

    let questions: any[] = []
    try {
      const response = await generateWithRouter(
        { systemPrompt, userPrompt, maxTokens: 1200, temperature: 0.3 },
        consultingFirmId,
        { task: 'BID_GUIDANCE', useCache: false }
      )

      const cleaned = response.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      const start = cleaned.indexOf('[')
      const end = cleaned.lastIndexOf(']')
      if (start !== -1 && end !== -1) {
        questions = JSON.parse(cleaned.slice(start, end + 1))
      }
    } catch (err) {
      logger.warn('Question generation failed, using defaults', { error: (err as Error).message })
    }

    // Fallback if LLM failed or returned empty
    if (!questions.length) {
      questions = [
        { id: 'q1', category: 'PRICING', question: 'What is your proposed total contract price and cost structure?', hint: 'e.g., $2.4M total: $1.8M labor, $400K ODC, 10% profit fee', required: true },
        { id: 'q2', category: 'PERSONNEL', question: 'Who is your proposed Program Manager and what are their key qualifications?', hint: 'e.g., Jane Smith, PMP, 15 years VA contracting experience', required: true },
        { id: 'q3', category: 'PAST_PERFORMANCE', question: 'What are your 2-3 most relevant prior contracts to reference?', hint: 'e.g., Contract #, Agency, dollar value, period, scope similarity', required: true },
        { id: 'q4', category: 'TECHNICAL', question: 'What is your primary technical differentiator for this work?', hint: 'e.g., proprietary platform, specialized methodology, cleared staff', required: true },
        { id: 'q5', category: 'TEAMING', question: 'Are you teaming with any subcontractors? If so, who and what role?', hint: 'e.g., Acme LLC (SDVOSB) for cybersecurity work — 20% of contract value', required: false },
        { id: 'q6', category: 'CERTIFICATIONS', question: 'What relevant certifications does your firm hold?', hint: 'e.g., ISO 9001, CMMI Level 3, SDVOSB, 8(a)', required: false },
        { id: 'q7', category: 'OTHER', question: 'Is there anything else the proposal should specifically highlight or address?', hint: 'e.g., incumbent risk response, unique past performance with this agency', required: false },
      ]
    }

    res.json({ success: true, data: questions })
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------
// POST /api/proposal-assist/:opportunityId/draft  (costs 5 tokens)
// Accepts: { answers?: ProposalAnswer[], userGuidance?: string }
// Returns: PDF blob
// ---------------------------------------------------------------
router.post('/:opportunityId/draft', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    logger.info('Proposal draft PDF requested', { opportunityId: req.params.opportunityId, consultingFirmId })

    const aiCheck = await checkAiCallLimit(consultingFirmId)
    if (!aiCheck.allowed) {
      return res.status(403).json({ error: 'AI_LIMIT', message: `AI call limit reached (${aiCheck.current}/${aiCheck.max} this month).` })
    }

    const tokenCheck = await checkProposalTokens(consultingFirmId, 5)
    if (!tokenCheck.allowed) {
      return res.status(402).json({
        error: 'NO_TOKENS',
        message: `Generating a full draft costs 5 tokens but you only have ${tokenCheck.balance}. Purchase more in Billing → Proposal Token Packs.`,
        balance: tokenCheck.balance,
      })
    }

    const { opportunityId } = req.params

    const [opp, matrix] = await Promise.all([
      prisma.opportunity.findFirst({
        where: { id: opportunityId, consultingFirmId },
        select: { id: true, title: true, agency: true, naicsCode: true, setAsideType: true, estimatedValue: true, historicalWinner: true, description: true },
      }),
      prisma.complianceMatrix.findUnique({
        where: { opportunityId },
        include: { requirements: { orderBy: { sortOrder: 'asc' }, take: 30 } },
      }),
    ])

    if (!opp) throw new NotFoundError('Opportunity')

    const requirements = (matrix?.requirements ?? []).map(r => ({
      section: r.section,
      requirementText: r.requirementText,
      isMandatory: r.isMandatory,
    }))

    const userGuidance: string | undefined = typeof req.body?.userGuidance === 'string' && req.body.userGuidance.trim()
      ? req.body.userGuidance.trim().slice(0, 3000)
      : undefined

    const answers: ProposalAnswer[] = Array.isArray(req.body?.answers) ? req.body.answers : []
    const bidFormContext: string | undefined = typeof req.body?.bidFormContext === 'string' && req.body.bidFormContext.trim()
      ? req.body.bidFormContext.trim().slice(0, 4000)
      : undefined

    const draft = await generateProposalDraft(
      opp.title,
      opp.agency,
      requirements,
      {
        naicsCode: opp.naicsCode ?? undefined,
        setAsideType: opp.setAsideType,
        estimatedValue: opp.estimatedValue ? Number(opp.estimatedValue) : null,
        historicalWinner: opp.historicalWinner,
        description: opp.description,
      },
      consultingFirmId,
      answers,
      userGuidance,
      bidFormContext
    )

    logger.info('Proposal draft generated, building PDF', { opportunityId, sectionCount: draft.sections.length })

    const pdfBuffer = await buildProposalPdf(draft)
    await deductProposalTokens(consultingFirmId, 5)

    const safeName = opp.title.replace(/[^a-z0-9]/gi, '_').slice(0, 60)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Proposal_Draft_${safeName}.pdf"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    res.send(pdfBuffer)
  } catch (err: any) {
    if (err?.message === 'NO_LLM_KEY') {
      return res.status(400).json({ error: 'NO_AI_KEY', message: 'No AI key configured — go to Settings to add your API key.' })
    }
    if (err?.message === 'RATE_LIMITED') {
      return res.status(429).json({ error: 'RATE_LIMITED', message: 'AI rate limit reached — please wait 60 seconds and try again.' })
    }
    next(err)
  }
})

// ---------------------------------------------------------------
// POST /api/proposal-assist/:opportunityId/extract-form
// Accepts: file upload (PDF, Word, Excel, CSV, TXT)
// Returns: { text: string } — extracted text content for AI context
// ---------------------------------------------------------------
router.post('/:opportunityId/extract-form', upload.single('file'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let storedFilePath: string | null = null
  try {
    const consultingFirmId = getTenantId(req)
    const { opportunityId } = req.params

    const opp = await prisma.opportunity.findFirst({
      where: { id: opportunityId, consultingFirmId },
      select: { id: true },
    })
    if (!opp) throw new NotFoundError('Opportunity')
    if (!req.file) return res.status(400).json({ error: 'File is required' })

    storedFilePath = req.file.path
    const ext = path.extname(req.file.originalname).toLowerCase()
    let text = ''

    if (ext === '.pdf') {
      text = await (docAnalysisService as any).extractPdfText(storedFilePath)
    } else if (ext === '.docx' || ext === '.doc') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ path: storedFilePath })
      text = result.value
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.readFile(storedFilePath)
      const lines: string[] = []
      workbook.SheetNames.forEach(sheetName => {
        lines.push(`=== Sheet: ${sheetName} ===`)
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_csv(sheet)
        lines.push(rows)
      })
      text = lines.join('\n')
    } else if (ext === '.csv') {
      text = fs.readFileSync(storedFilePath, 'utf-8')
    } else {
      text = fs.readFileSync(storedFilePath, 'utf-8')
    }

    // Clean up the temp file
    try { fs.unlinkSync(storedFilePath) } catch {}
    storedFilePath = null

    const truncated = text.trim().slice(0, 8000)
    if (!truncated) return res.status(422).json({ error: 'Could not extract readable text from this file.' })

    logger.info('Bid form extracted', { opportunityId, fileName: req.file.originalname, chars: truncated.length })
    res.json({ success: true, text: truncated, fileName: req.file.originalname })
  } catch (err) {
    if (storedFilePath) { try { fs.unlinkSync(storedFilePath) } catch {} }
    next(err)
  }
})

// ---------------------------------------------------------------
// GET /api/proposal-assist/:opportunityId/saved
// Returns saved outline, answers, and step so the user doesn't lose work
// ---------------------------------------------------------------
router.get('/:opportunityId/saved', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const opp = await prisma.opportunity.findFirst({
      where: { id: req.params.opportunityId, consultingFirmId },
      select: { savedProposalOutline: true, savedProposalAnswers: true, savedProposalStep: true },
    })
    if (!opp) throw new NotFoundError('Opportunity')
    res.json({
      success: true,
      data: {
        outline: opp.savedProposalOutline,
        answers: opp.savedProposalAnswers,
        step: opp.savedProposalStep,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------
// PUT /api/proposal-assist/:opportunityId/saved
// Persists outline, answers, and step so navigating away doesn't lose work
// ---------------------------------------------------------------
router.put('/:opportunityId/saved', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { outline, answers, step } = req.body

    const opp = await prisma.opportunity.findFirst({
      where: { id: req.params.opportunityId, consultingFirmId },
      select: { id: true },
    })
    if (!opp) throw new NotFoundError('Opportunity')

    await prisma.opportunity.update({
      where: { id: opp.id },
      data: {
        savedProposalOutline: outline ?? undefined,
        savedProposalAnswers: answers ?? undefined,
        savedProposalStep: step ?? undefined,
      },
    })

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
