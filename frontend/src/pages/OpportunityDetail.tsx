import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { opportunitiesApi, jobsApi, documentsApi, scoreApi, clientsApi, decisionsApi, complianceMatrixApi } from '../services/api'
import { useQuery } from '@tanstack/react-query'
import { ScoreBreakdown } from '../components/ScoreBreakdown'
import {
  Upload, FileText, Loader, CheckCircle, AlertCircle,
  ExternalLink, Trophy, Users, TrendingUp, Shield,
  Languages, ChevronDown, ChevronUp, Download, ArrowLeft, BookOpen, Send, Mail, ClipboardList,
  UserCheck, BarChart3, Table2, RefreshCw, Pencil,
} from 'lucide-react'
import { parseSubmissionInstructions } from '../utils/parseSubmission'

interface Amendment {
  id: string
  title?: string
  description?: string
  amendmentNumber?: string
  postedDate?: string
  plainLanguageSummary?: string
  interpretedAt?: string
}

interface Document {
  id: string
  fileName: string
  fileType: string
  fileUrl?: string
  analysisStatus: string
  alignmentScore?: number
  complexityScore?: number
  incumbentSignals?: string[]
  scopeKeywords?: string[]
  uploadedAt: string
}

interface OpportunityDetail {
  id: string
  samNoticeId?: string
  title: string
  agency: string
  naicsCode: string
  naicsDescription?: string
  responseDeadline: string
  probabilityScore?: number
  expectedValue?: number
  sourceUrl?: string
  setAsideType?: string
  estimatedValue?: number
  estimatedValueMin?: number
  estimatedValueMax?: number
  description?: string
  placeOfPerformance?: string
  amendments?: Amendment[]
  documents?: Document[]
  scoreBreakdown?: any
  isEnriched?: boolean
  historicalWinner?: string
  historicalAvgAward?: number
  historicalAwardCount?: number
  competitionCount?: number
  incumbentProbability?: number
  agencySdvosbRate?: number
  recompeteFlag?: boolean
  incumbentSignalDetected?: boolean
  deadlineClassification?: { priority: string; daysUntilDeadline: number; label: string }
  pocName?: string
  pocEmail?: string
  pocPhone?: string
  pocTitle?: string
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [data, setData] = useState<OpportunityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [analyzeStatus, setAnalyzeStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle')
  const [interpretingId, setInterpretingId] = useState<string | null>(null)
  const [expandedAmendmentId, setExpandedAmendmentId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [clientScore, setClientScore] = useState<any>(null)
  const [scoringClient, setScoringClient] = useState(false)
  const [scoreError, setScoreError] = useState('')

  // Compliance matrix
  const [matrix, setMatrix] = useState<any>(null)
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [matrixGenerating, setMatrixGenerating] = useState(false)
  const [matrixError, setMatrixError] = useState('')
  const [editingReqId, setEditingReqId] = useState<string | null>(null)
  const [editProposalSection, setEditProposalSection] = useState('')

  const fetchOpportunity = async () => {
    if (!id) return
    try {
      const res = await opportunitiesApi.getById(id)
      setData(res.data ?? res)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const fetchMatrix = async () => {
    if (!id) return
    setMatrixLoading(true)
    try {
      const res = await complianceMatrixApi.get(id)
      setMatrix(res.data ?? null)
    } catch { /* non-fatal */ } finally {
      setMatrixLoading(false)
    }
  }

  const handleGenerateMatrix = async () => {
    if (!id) return
    setMatrixGenerating(true)
    setMatrixError('')
    try {
      const res = await complianceMatrixApi.generate(id)
      setMatrix(res.data)
    } catch (err: any) {
      setMatrixError(err?.response?.data?.error || 'Generation failed')
    } finally {
      setMatrixGenerating(false)
    }
  }

  const handleUpdateRequirement = async (reqId: string, proposalSection: string) => {
    try {
      const res = await complianceMatrixApi.updateRequirement(reqId, { proposalSection })
      setMatrix((prev: any) => prev ? {
        ...prev,
        requirements: prev.requirements.map((r: any) => r.id === reqId ? res.data : r),
      } : prev)
    } catch { /* non-fatal */ } finally {
      setEditingReqId(null)
    }
  }

  const handleCycleStatus = async (req: any) => {
    const cycle = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'WAIVED', 'NON_COMPLIANT']
    const next = cycle[(cycle.indexOf(req.status) + 1) % cycle.length]
    try {
      const res = await complianceMatrixApi.updateRequirement(req.id, { status: next })
      setMatrix((prev: any) => prev ? {
        ...prev,
        requirements: prev.requirements.map((r: any) => r.id === req.id ? res.data : r),
      } : prev)
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    // Clear stale data immediately when opportunity ID changes
    setData(null)
    setError(false)
    setLoading(true)
    setMatrix(null)
    setMatrixError('')
    setMatrixLoading(false)
    setClientScore(null)
    setScoreError('')
    setAnalyzeStatus('idle')
    setUploadError('')
    if (pollRef.current) { clearTimeout(pollRef.current as any); pollRef.current = null }

    fetchOpportunity()
    fetchMatrix()
    return () => { if (pollRef.current) { clearTimeout(pollRef.current as any); pollRef.current = null } }
  }, [id])

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clientsApi.list({ limit: 200 }),
  })
  const clients: any[] = clientsData?.data ?? []

  const runClientScore = async (clientId: string) => {
    if (!clientId || !id) return
    setScoringClient(true)
    setScoreError('')
    setClientScore(null)
    try {
      const res = await decisionsApi.run(id, clientId)
      setClientScore(res.data ?? res)
    } catch (err: any) {
      setScoreError(err?.response?.data?.error || 'Scoring failed')
    } finally {
      setScoringClient(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setUploading(true)
    setUploadError('')
    try {
      const uploadRes = await documentsApi.upload(id, file)
      const documentId = uploadRes.data?.id ?? uploadRes.id
      const jobRes = await jobsApi.triggerDocumentAnalysis(documentId)
      const jobId = jobRes.data?.jobId ?? jobRes.jobId
      setAnalyzeStatus('running')
      let pollAttempts = 0
      const pollAnalysis = async () => {
        pollAttempts++
        if (pollAttempts > 40) { setAnalyzeStatus('error'); pollRef.current = null; return } // 40 × 3s = 2 min cap
        try {
          const jobCheck = await jobsApi.getJob(jobId)
          const status: string = jobCheck.data?.status ?? jobCheck.status ?? ''
          if (status === 'COMPLETE') {
            pollRef.current = null
            setAnalyzeStatus('complete')
            fetchOpportunity()
          } else if (status === 'FAILED') {
            pollRef.current = null
            setAnalyzeStatus('error')
          } else {
            pollRef.current = setTimeout(pollAnalysis, 3000) as any
          }
        } catch {
          // transient error — keep polling
          pollRef.current = setTimeout(pollAnalysis, 3000) as any
        }
      }
      pollAnalysis() // start immediately
    } catch (err: any) {
      setUploadError(err?.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleInterpretAmendment = async (amendmentId: string) => {
    if (!id) return
    setInterpretingId(amendmentId)
    try {
      await scoreApi.interpretAmendment(id, amendmentId)
      await fetchOpportunity()
      setExpandedAmendmentId(amendmentId)
    } catch {
      // non-fatal
    } finally {
      setInterpretingId(null)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 mt-10">
      <Loader className="w-4 h-4 animate-spin" /> Loading opportunity...
    </div>
  )
  if (error) return <div className="text-red-400 mt-10">Failed to load opportunity.</div>
  if (!data) return null

  const prob = data.probabilityScore ?? 0
  const probColor = prob >= 0.65 ? 'text-green-400' : prob >= 0.40 ? 'text-yellow-400' : 'text-gray-400'
  const dl = data.deadlineClassification
  const deadlineBadgeClass =
    dl?.priority === 'RED' ? 'bg-red-900/50 text-red-300 border-red-700' :
    dl?.priority === 'YELLOW' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' :
    'bg-green-900/50 text-green-300 border-green-700'

  const fmt = (v: number) =>
    v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`

  const estValueDisplay = data.estimatedValue
    ? fmt(data.estimatedValue)
    : data.estimatedValueMin && data.estimatedValueMax
    ? `${fmt(data.estimatedValueMin)} – ${fmt(data.estimatedValueMax)}`
    : 'TBD'

  const subInfo = parseSubmissionInstructions(data.description ?? "")
  // Prefer POC email/name from SAM.gov over anything parsed from description text
  if (data.pocEmail && !subInfo.email) {
    subInfo.email = data.pocEmail
    if (!subInfo.method || subInfo.method === 'See solicitation for details') {
      subInfo.method = 'Email submission'
    }
  }
  if (data.pocName && !subInfo.contactName) subInfo.contactName = data.pocName

  const samUrl = data.sourceUrl
    || (data.samNoticeId ? `https://sam.gov/opp/${data.samNoticeId}/view` : null)
    || `https://sam.gov/search/?index=opp&keywords=${encodeURIComponent(data.title)}`

  return (
    <div className="space-y-6 pb-12">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Opportunities
      </button>

      {/* ── HEADER CARD ─────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-200 leading-snug mb-1">{data.title}</h1>
            <p className="text-sm text-gray-500">{data.agency}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-500 mb-0.5">Win Probability</p>
            <p className={`text-4xl font-bold font-mono ${probColor}`}>
              {Math.round(prob * 100)}%
            </p>
            {(data.expectedValue ?? 0) > 0 && (
              <p className="text-xs text-green-400 font-mono mt-0.5">
                EV {fmt(data.expectedValue!)}
              </p>
            )}
          </div>
        </div>

        {/* Key fields grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-5">
          <div>
            <p className="text-gray-500 text-xs mb-0.5">NAICS</p>
            <p className="text-gray-200 font-mono">{data.naicsCode}</p>
            {data.naicsDescription && <p className="text-xs text-gray-600 truncate">{data.naicsDescription}</p>}
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-0.5">Response Deadline</p>
            <p className="text-gray-200">
              {new Date(data.responseDeadline).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </p>
            {dl && (
              <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded border mt-0.5 ${deadlineBadgeClass}`}>
                {dl.daysUntilDeadline}d remaining
              </span>
            )}
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-0.5">Est. Contract Value</p>
            <p className="text-gray-100 font-mono font-semibold text-base">{estValueDisplay}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-0.5">Set-Aside</p>
            {data.setAsideType && data.setAsideType !== 'NONE' ? (
              <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-700 px-2 py-0.5 rounded">
                {data.setAsideType}
              </span>
            ) : (
              <span className="text-xs text-gray-500">Open Competition</span>
            )}
          </div>
          {data.placeOfPerformance && (
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Place of Performance</p>
              <p className="text-gray-200 text-sm">{data.placeOfPerformance}</p>
            </div>
          )}
        </div>

        {/* Point of Contact */}
        {(data.pocName || data.pocEmail) && (
          <div className="mb-4 flex items-start gap-3 bg-blue-950/20 border border-blue-900/40 rounded-lg px-4 py-3">
            <Mail className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500 mb-0.5">Contracting Officer / Point of Contact</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {data.pocName && <p className="text-sm font-medium text-gray-200">{data.pocName}</p>}
                {data.pocTitle && <p className="text-xs text-gray-500">{data.pocTitle}</p>}
                {data.pocEmail && (
                  <a href={"mailto:" + data.pocEmail} className="text-sm text-blue-400 hover:text-blue-300 font-mono">
                    {data.pocEmail}
                  </a>
                )}
                {data.pocPhone && <p className="text-sm text-gray-400 font-mono">{data.pocPhone}</p>}
              </div>
            </div>
          </div>
        )}

        {/* SAM.gov CTA — primary action */}
        {(() => {
          const subInfo = parseSubmissionInstructions(data.description ?? "")

  const samUrl = data.sourceUrl
            || (data.samNoticeId ? `https://sam.gov/opp/${data.samNoticeId}/view` : null)
            || `https://sam.gov/search/?index=opp&keywords=${encodeURIComponent(data.title)}`
          return (
            <a
              href={samUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View on SAM.gov
            </a>
          )
        })()}

        {/* Description */}
        {data.description && (
          <div className="mt-5 border-t border-gray-800 pt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Description</p>
            <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{data.description}</p>
          </div>
        )}
      </div>

      
      {/* CLIENT SCORING CONTEXT */}
      <div className="card border-blue-800/50">
        <h2 className="text-base font-semibold text-gray-200 mb-3 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-blue-400" />
          Score for a Specific Client
        </h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-gray-500 text-xs mb-1 block">Select Client Company</label>
            <select
              className="input w-full text-sm"
              value={selectedClientId}
              onChange={(e) => { setSelectedClientId(e.target.value); setClientScore(null); setScoreError('') }}
            >
              <option value="">-- Choose a client --</option>
              {clients.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => runClientScore(selectedClientId)}
            disabled={!selectedClientId || scoringClient}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {scoringClient ? <Loader className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            {scoringClient ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
        {scoreError && <p className="text-red-400 text-xs mt-2">{scoreError}</p>}
        {clientScore && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-gray-800 pt-4">
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Win Probability</p>
              <p className="text-2xl font-bold font-mono text-green-400">{clientScore.winProbabilityPercent}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Recommendation</p>
              <span className={'text-sm font-semibold px-2 py-0.5 rounded ' + (
                clientScore.recommendation === 'BID PRIME' ? 'bg-green-900/40 text-green-300' :
                clientScore.recommendation === 'BID SUB' ? 'bg-blue-900/40 text-blue-300' :
                'bg-red-900/40 text-red-300'
              )}>
                {clientScore.recommendation}
              </span>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">ROI Multiple</p>
              <p className="text-xl font-bold font-mono text-blue-300">{clientScore.roiMultiple}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Risk Level</p>
              <span className={'text-sm font-semibold px-2 py-0.5 rounded ' + (
                clientScore.riskLevel === 'LOW' ? 'bg-green-900/40 text-green-300' :
                clientScore.riskLevel === 'MODERATE' ? 'bg-yellow-900/40 text-yellow-300' :
                'bg-red-900/40 text-red-300'
              )}>
                {clientScore.riskLevel}
              </span>
              <p className="text-xs text-gray-600 mt-1 leading-tight">
                {clientScore.riskLevel === 'LOW'
                  ? 'No blockers — deadline, penalties, and compliance are clear.'
                  : clientScore.riskLevel === 'MODERATE'
                  ? 'Some risk: tight timeline, past penalties, or compliance notes. Review before committing.'
                  : 'High risk — imminent deadline, unpaid penalties, compliance block, or poor submission history.'}
              </p>
            </div>
            {clientScore.netExpectedValue != null && (
              <div>
                <p className="text-gray-500 text-xs mb-0.5">Net Expected Value</p>
                <p className="text-sm font-mono text-green-400">{fmt(Number(clientScore.netExpectedValue))}</p>
              </div>
            )}
            {clientScore.deadlineSummary && (
              <div>
                <p className="text-gray-500 text-xs mb-0.5">Deadline</p>
                <p className="text-sm text-gray-300">{clientScore.deadlineSummary}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── AT A GLANCE — PLAIN ENGLISH SUMMARY ──────────────── */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-400" />
          What Is This Contract?
        </h2>
        <div className="space-y-3 text-sm">
          {/* What they want */}
          <div className="flex gap-3">
            <span className="text-blue-400 flex-shrink-0 mt-0.5">{'•'}</span>
            <p className="text-gray-300">
              <span className="text-gray-400">What they are buying: </span>
              {data.description
                ? data.description.split(/[.\n]/)[0].trim() + '.'
                : `Services under NAICS ${data.naicsCode}${data.naicsDescription ? ` (${data.naicsDescription})` : ''}.`}
            </p>
          </div>
          {/* Who can bid */}
          <div className="flex gap-3">
            <span className="text-blue-400 flex-shrink-0 mt-0.5">{'•'}</span>
            <p className="text-gray-300">
              <span className="text-gray-400">Who can bid: </span>
              {data.setAsideType && data.setAsideType !== 'NONE'
                ? `This is a set-aside contract restricted to ${data.setAsideType} businesses. Only eligible firms may submit a proposal.`
                : 'This is an open competition — any qualified business may submit a proposal.'}
            </p>
          </div>
          {/* Contract value */}
          <div className="flex gap-3">
            <span className="text-blue-400 flex-shrink-0 mt-0.5">{'•'}</span>
            <p className="text-gray-300">
              <span className="text-gray-400">Estimated value: </span>
              {estValueDisplay === 'TBD'
                ? 'The government has not yet published an estimated contract value.'
                : `The government estimates this contract is worth approximately ${estValueDisplay}.`}
            </p>
          </div>
          {/* Deadline */}
          <div className="flex gap-3">
            <span className="text-blue-400 flex-shrink-0 mt-0.5">{'•'}</span>
            <p className="text-gray-300">
              <span className="text-gray-400">Proposal deadline: </span>
              {new Date(data.responseDeadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {dl ? ` — ${dl.daysUntilDeadline} days from today.` : '.'}
            </p>
          </div>
          {/* Place of performance */}
          {data.placeOfPerformance && (
            <div className="flex gap-3">
              <span className="text-blue-400 flex-shrink-0 mt-0.5">{'•'}</span>
              <p className="text-gray-300">
                <span className="text-gray-400">Where the work happens: </span>
                {data.placeOfPerformance}.
              </p>
            </div>
          )}
          {/* Win probability plain-language */}
          <div className="flex gap-3">
            <span className={probColor + ' flex-shrink-0 mt-0.5'}>{'•'}</span>
            <p className="text-gray-300">
              <span className="text-gray-400">Your estimated chances: </span>
              {prob >= 0.65
                ? `Strong fit — our model gives you a ${Math.round(prob * 100)}% win probability based on your firm profile, NAICS alignment, and agency history.`
                : prob >= 0.40
                ? `Moderate fit — ${Math.round(prob * 100)}% win probability. Review the set-aside requirements and agency preference history before committing.`
                : `Low fit — ${Math.round(prob * 100)}% win probability. Consider whether the investment in proposal preparation is justified.`}
            </p>
          </div>
        </div>
      </div>


      {/* ── HOW TO SUBMIT ────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <Send className="w-5 h-5 text-blue-400" />
          How to Submit
          {subInfo.rawFound && (
            <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-1.5 py-0.5 rounded font-normal ml-1">
              extracted
            </span>
          )}
        </h2>

        {(subInfo.rawFound || subInfo.email || subInfo.documents.length > 0 || subInfo.steps.length > 0) ? (
        <div className="space-y-4">
          {/* Submission method + contact */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <p className="text-gray-500 text-xs mb-1 flex items-center gap-1">
                <Mail className="w-3 h-3" /> Submission Method
              </p>
              <p className="text-gray-200 text-sm font-medium">{subInfo.method}</p>
              {subInfo.email && (
                <a
                  href={"mailto:" + subInfo.email}
                  className="text-blue-400 hover:text-blue-300 text-sm font-mono mt-1 block"
                >
                  {subInfo.email}
                </a>
              )}
              {subInfo.contactName && (
                <p className="text-xs text-gray-500 mt-0.5">Contact: {subInfo.contactName}</p>
              )}
            </div>
            {subInfo.subjectLine && (
              <div className="flex-1 min-w-[200px]">
                <p className="text-gray-500 text-xs mb-1">Email Subject Line</p>
                <p className="text-yellow-300 text-xs font-mono bg-gray-900 px-3 py-2 rounded border border-gray-800">
                  {subInfo.subjectLine}
                </p>
              </div>
            )}
          </div>

          {/* Documents required */}
          {subInfo.documents.length > 0 && (
            <div>
              <p className="text-gray-500 text-xs mb-2 flex items-center gap-1">
                <ClipboardList className="w-3 h-3" /> Documents / Volumes Required
              </p>
              <div className="flex flex-wrap gap-2">
                {subInfo.documents.map((doc, i) => (
                  <span key={i} className="text-xs bg-blue-900/30 text-blue-300 border border-blue-800 px-2 py-1 rounded">
                    {doc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Step-by-step instructions */}
          {subInfo.steps.length > 0 && (
            <div>
              <p className="text-gray-500 text-xs mb-2">Key Submission Steps</p>
              <ol className="space-y-1.5">
                {subInfo.steps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-300">
                    <span className="text-blue-500 font-mono text-xs mt-0.5 flex-shrink-0">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

        </div>
        ) : (
          <div className="flex items-start gap-3 bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-3">
            <Upload className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-400 font-medium">Submission details not yet available</p>
              <p className="text-xs text-gray-600 mt-1">
                The SAM.gov synopsis does not contain submission instructions. Upload the full solicitation
                package (SOW, RFQ, or RFP) in the Documents section below and the system will automatically
                extract the contact email, required volumes, and key submission steps.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── WIN PROBABILITY SCORE BREAKDOWN ─────────────────── */}
      <ScoreBreakdown
        breakdown={data.scoreBreakdown}
        probability={prob}
        estimatedValue={data.estimatedValue}
        expectedValue={data.expectedValue}
        samUrl={samUrl}
      />

      {/* ── AWARD HISTORY INTELLIGENCE (USASpending) ────────── */}
      {data.isEnriched && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Award History Intelligence
            <span className="text-xs text-gray-600 font-normal ml-1">(USASpending.gov — past 5 years)</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {data.historicalWinner && (
              <div className="col-span-2">
                <p className="text-gray-500 text-xs flex items-center gap-1 mb-0.5">
                  <Trophy className="w-3 h-3" /> Historical Incumbent
                </p>
                <p className="text-gray-200 font-medium">{data.historicalWinner}</p>
                {data.incumbentProbability != null && (
                  <p className="text-xs text-yellow-400 mt-0.5">
                    Won {Math.round(data.incumbentProbability * 100)}% of historical awards in this category
                  </p>
                )}
              </div>
            )}
            {data.competitionCount != null && (
              <div>
                <p className="text-gray-500 text-xs flex items-center gap-1 mb-0.5">
                  <Users className="w-3 h-3" /> Competing Firms
                </p>
                <p className="text-gray-200 font-mono text-2xl font-bold">{data.competitionCount}</p>
              </div>
            )}
            {(data.historicalAvgAward ?? 0) > 0 && (
              <div>
                <p className="text-gray-500 text-xs mb-0.5">Avg Historical Award</p>
                <p className="text-gray-200 font-mono">{fmt(data.historicalAvgAward!)}</p>
              </div>
            )}
            {data.agencySdvosbRate != null && (
              <div>
                <p className="text-gray-500 text-xs flex items-center gap-1 mb-0.5">
                  <Shield className="w-3 h-3" /> Agency SDVOSB Rate
                </p>
                <p className="text-gray-200 font-mono">{Math.round(data.agencySdvosbRate * 100)}%</p>
              </div>
            )}
            {data.historicalAwardCount != null && (
              <div>
                <p className="text-gray-500 text-xs mb-0.5">Total Awards (5yr)</p>
                <p className="text-gray-200 font-mono">{data.historicalAwardCount.toLocaleString()}</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {data.recompeteFlag && (
              <span className="text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-700 px-2 py-1 rounded">
                Recompete Detected
              </span>
            )}
            {data.incumbentSignalDetected && (
              <span className="text-xs bg-orange-900/40 text-orange-300 border border-orange-700 px-2 py-1 rounded">
                Incumbent Signal in Documents
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── DOCUMENT UPLOAD ──────────────────────────────────── */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-200 mb-1 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" />
          Solicitation Documents
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Upload the SOW, solicitation package, or amendments. The scoring engine will re-analyze
          scope alignment and automatically update the win probability.
        </p>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || analyzeStatus === 'running'}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {uploading
              ? <Loader className="w-4 h-4 animate-spin" />
              : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Upload Document / Amendment'}
          </button>

          {analyzeStatus === 'running' && (
            <span className="flex items-center gap-2 text-blue-300 text-sm">
              <Loader className="w-4 h-4 animate-spin" />
              Analyzing — probability will update automatically
            </span>
          )}
          {analyzeStatus === 'complete' && (
            <span className="flex items-center gap-2 text-green-300 text-sm">
              <CheckCircle className="w-4 h-4" /> Analysis complete — score updated
            </span>
          )}
          {analyzeStatus === 'error' && (
            <span className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" /> Analysis failed
            </span>
          )}
        </div>

        {uploadError && <p className="text-red-400 text-xs mb-3">{uploadError}</p>}

        {data.documents && data.documents.length > 0 ? (
          <div className="space-y-3">
            {data.documents.map((doc) => (
              <div key={doc.id} className="border border-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-200">{doc.fileName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.fileUrl && (
                      <a
                        href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}${doc.fileUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                      >
                        <Download className="w-3 h-3" /> Download
                      </a>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      doc.analysisStatus === 'COMPLETE'   ? 'bg-green-900/40 text-green-300' :
                      doc.analysisStatus === 'RUNNING'    ? 'bg-blue-900/40 text-blue-300' :
                      doc.analysisStatus === 'FAILED'     ? 'bg-red-900/40 text-red-300' :
                      doc.analysisStatus === 'NO_AI_KEY'  ? 'bg-yellow-900/40 text-yellow-300' :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {doc.analysisStatus === 'NO_AI_KEY' ? 'No AI Key' : doc.analysisStatus}
                    </span>
                  </div>
                </div>

                {doc.analysisStatus === 'NO_AI_KEY' && (
                  <div className="mt-2 text-xs bg-yellow-950/30 border border-yellow-800/40 rounded-lg px-3 py-2 text-yellow-300">
                    AI analysis is disabled. Add <span className="font-mono">ANTHROPIC_API_KEY=sk-ant-...</span> to{' '}
                    <span className="font-mono">backend/.env</span> and restart the server to enable scope alignment scoring.
                  </div>
                )}

                {doc.analysisStatus === 'COMPLETE' && (
                  <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                    {doc.alignmentScore != null && (
                      <div>
                        <p className="text-gray-500">Scope Alignment</p>
                        <p className={`font-mono font-semibold ${
                          doc.alignmentScore >= 0.7 ? 'text-green-400' :
                          doc.alignmentScore >= 0.4 ? 'text-yellow-400' : 'text-gray-400'
                        }`}>
                          {Math.round(doc.alignmentScore * 100)}%
                        </p>
                      </div>
                    )}
                    {doc.complexityScore != null && (
                      <div>
                        <p className="text-gray-500">Technical Complexity</p>
                        <p className="text-gray-200 font-mono">{Math.round(doc.complexityScore * 100)}%</p>
                      </div>
                    )}
                    {doc.incumbentSignals && doc.incumbentSignals.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-gray-500 mb-1">Incumbent Signals Detected</p>
                        <div className="flex flex-wrap gap-1">
                          {doc.incumbentSignals.map((s, i) => (
                            <span key={i} className="bg-orange-900/30 text-orange-300 border border-orange-800 px-2 py-0.5 rounded">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {doc.scopeKeywords && doc.scopeKeywords.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-gray-500 mb-1">Scope Keywords</p>
                        <div className="flex flex-wrap gap-1">
                          {doc.scopeKeywords.slice(0, 12).map((kw, i) => (
                            <span key={i} className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 text-sm">No documents uploaded yet.</p>
        )}
      </div>

      {/* ── COMPLIANCE MATRIX ────────────────────────────────── */}
      {(() => {
        const reqs: any[] = matrix?.requirements ?? []
        const done = reqs.filter((r: any) => r.status === 'COMPLETE').length
        const pct = reqs.length ? Math.round((done / reqs.length) * 100) : 0

        const statusMeta: Record<string, { label: string; cls: string }> = {
          NOT_STARTED:   { label: 'Not Started',    cls: 'bg-gray-800 text-gray-400' },
          IN_PROGRESS:   { label: 'In Progress',    cls: 'bg-blue-900/40 text-blue-300 border border-blue-700' },
          COMPLETE:      { label: 'Complete',       cls: 'bg-green-900/40 text-green-300 border border-green-700' },
          WAIVED:        { label: 'Waived',         cls: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700' },
          NON_COMPLIANT: { label: 'Non-Compliant',  cls: 'bg-red-900/40 text-red-300 border border-red-700' },
        }
        const typeMeta: Record<string, string> = {
          INSTRUCTION:   'bg-blue-900/30 text-blue-400',
          EVALUATION:    'bg-purple-900/30 text-purple-400',
          CLAUSE:        'bg-orange-900/30 text-orange-400',
          CERTIFICATION: 'bg-teal-900/30 text-teal-400',
        }

        return (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                <Table2 className="w-5 h-5 text-blue-400" />
                Compliance Matrix
                {reqs.length > 0 && (
                  <span className="text-xs font-normal text-gray-500 ml-1">
                    {done}/{reqs.length} complete ({pct}%)
                  </span>
                )}
              </h2>
              <button
                onClick={handleGenerateMatrix}
                disabled={matrixGenerating}
                className="flex items-center gap-1.5 text-sm bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-800 px-3 py-1.5 rounded-lg transition-colors"
              >
                {matrixGenerating
                  ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                  : <><RefreshCw className="w-3.5 h-3.5" /> {reqs.length ? 'Regenerate' : 'Generate Matrix'}</>}
              </button>
            </div>

            {matrixError && <p className="text-red-400 text-xs mb-3">{matrixError}</p>}

            {matrixLoading && (
              <p className="text-gray-500 text-sm flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin" /> Loading...
              </p>
            )}

            {!matrixLoading && reqs.length === 0 && (
              <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-4 text-sm text-gray-500">
                <p className="font-medium text-gray-400 mb-1">No compliance matrix yet</p>
                <p>Click <span className="text-blue-400">Generate Matrix</span> to extract Section L/M requirements from the opportunity description or any uploaded solicitation document.</p>
                <p className="mt-2 text-xs text-gray-600">Tip: Upload the full RFP/SOW first for best results. Without <span className="font-mono text-yellow-500">ANTHROPIC_API_KEY</span> set in <span className="font-mono text-yellow-500">backend/.env</span>, a standard template will be used instead of AI extraction.</p>
              </div>
            )}

            {reqs.length > 0 && (
              <>
                {/* Progress bar */}
                <div className="w-full bg-gray-800 rounded-full h-1.5 mb-4">
                  <div
                    className="h-1.5 rounded-full bg-green-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-2 mb-4 text-xs">
                  {Object.entries(typeMeta).map(([type, cls]) => (
                    <span key={type} className={`px-2 py-0.5 rounded ${cls}`}>{type}</span>
                  ))}
                  <span className="text-gray-600 ml-2">Click status badge to cycle through states.</span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-lg border border-gray-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 bg-gray-900/60">
                        <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium w-20">Section</th>
                        <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium w-24">Type</th>
                        <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Requirement</th>
                        <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium w-36">Proposal Section</th>
                        <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium w-32">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reqs.map((req: any) => {
                        const sm = statusMeta[req.status] ?? statusMeta.NOT_STARTED
                        const tm = typeMeta[req.sectionType] ?? typeMeta.INSTRUCTION
                        const isEditing = editingReqId === req.id
                        return (
                          <tr key={req.id} className="border-b border-gray-800/60 hover:bg-gray-800/20">
                            <td className="px-3 py-2.5">
                              <span className="font-mono text-xs text-gray-300">{req.section}</span>
                              {req.farReference && (
                                <p className="text-xs text-orange-400 mt-0.5">{req.farReference}</p>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${tm}`}>{req.sectionType}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="text-gray-200 leading-snug text-xs">{req.requirementText}</p>
                              {!req.isMandatory && (
                                <span className="text-xs text-gray-600 italic">optional</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {isEditing ? (
                                <div className="flex gap-1">
                                  <input
                                    autoFocus
                                    className="input text-xs py-1 px-2 w-24"
                                    value={editProposalSection}
                                    onChange={(e) => setEditProposalSection(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleUpdateRequirement(req.id, editProposalSection)
                                      if (e.key === 'Escape') setEditingReqId(null)
                                    }}
                                    placeholder="e.g. Vol I §3"
                                  />
                                  <button
                                    className="text-green-400 hover:text-green-300"
                                    onClick={() => handleUpdateRequirement(req.id, editProposalSection)}
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 group"
                                  onClick={() => { setEditingReqId(req.id); setEditProposalSection(req.proposalSection ?? '') }}
                                >
                                  <span className={req.proposalSection ? 'text-gray-200' : 'text-gray-600 italic'}>
                                    {req.proposalSection || 'Click to set'}
                                  </span>
                                  <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => handleCycleStatus(req)}
                                className={`text-xs px-2 py-0.5 rounded cursor-pointer hover:opacity-80 ${sm.cls}`}
                                title="Click to cycle status"
                              >
                                {sm.label}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-gray-700 mt-2">
                  Generated {new Date(matrix.generatedAt).toLocaleString()} · {reqs.length} requirements extracted
                </p>
              </>
            )}
          </div>
        )
      })()}

      {/* ── AMENDMENTS ───────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-200 mb-1 flex items-center gap-2">
          <Languages className="w-5 h-5 text-blue-400" />
          Amendments
          <span className="ml-1 text-xs text-gray-500 font-normal">
            — click an amendment to generate a plain-language interpretation
          </span>
        </h2>

        {(!data.amendments || data.amendments.length === 0) ? (
          <p className="text-gray-500 text-sm mt-3">No amendments on record for this solicitation.</p>
        ) : (
          <div className="space-y-3 mt-3">
            {data.amendments.map((a) => {
              const isOpen = expandedAmendmentId === a.id
              return (
                <div key={a.id} className="border border-gray-800 rounded-lg">
                  {/* Amendment header row */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/30 rounded-lg transition-colors"
                    onClick={() => setExpandedAmendmentId(isOpen ? null : a.id)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-300">
                        {a.title || `Amendment ${a.amendmentNumber ?? ''}`}
                      </p>
                      {a.postedDate && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Posted {new Date(a.postedDate).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {a.plainLanguageSummary && (
                        <span className="text-xs bg-green-900/40 text-green-300 border border-green-700 px-2 py-0.5 rounded">
                          Interpreted
                        </span>
                      )}
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-gray-500" />
                        : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </div>
                  </button>

                  {/* Expanded body */}
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-4">
                      {/* Original text */}
                      {a.description && (
                        <div>
                          <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">
                            Original Government Language
                          </p>
                          <p className="text-xs text-gray-400 bg-gray-800/50 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
                            {a.description}
                          </p>
                        </div>
                      )}

                      {/* Plain language */}
                      {a.plainLanguageSummary ? (
                        <div>
                          <p className="text-xs text-green-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Plain-Language Interpretation
                          </p>
                          <div className="bg-green-950/20 border border-green-800/40 rounded-lg p-3 space-y-2">
                            {a.plainLanguageSummary.split(' ● ').filter(Boolean).map((point, i) => (
                              <p key={i} className="text-sm text-gray-200 flex gap-2">
                                <span className="text-green-600 flex-shrink-0">•</span>
                                {point}
                              </p>
                            ))}
                          </div>
                          {a.interpretedAt && (
                            <p className="text-xs text-gray-700 mt-1.5">
                              Interpreted {new Date(a.interpretedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleInterpretAmendment(a.id)
                          }}
                          disabled={interpretingId === a.id}
                          className="w-full flex items-center justify-center gap-2 text-sm bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-800 px-4 py-2.5 rounded-lg transition-colors"
                        >
                          {interpretingId === a.id ? (
                            <><Loader className="w-3.5 h-3.5 animate-spin" /> Generating interpretation...</>
                          ) : (
                            <><Languages className="w-3.5 h-3.5" /> Generate Plain-Language Summary</>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
