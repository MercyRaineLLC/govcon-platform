import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { opportunitiesApi, jobsApi, documentsApi, scoreApi } from '../services/api'
import { ScoreBreakdown } from '../components/ScoreBreakdown'
import {
  Upload, FileText, Loader, CheckCircle, AlertCircle,
  ExternalLink, Trophy, Users, TrendingUp, Shield,
  Languages, ChevronDown, ChevronUp, Download, ArrowLeft,
} from 'lucide-react'

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

  useEffect(() => {
    fetchOpportunity()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

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
      pollRef.current = setInterval(async () => {
        try {
          const jobCheck = await jobsApi.getJob(jobId)
          const status = jobCheck.data?.status ?? jobCheck.status
          if (status === 'COMPLETE') {
            clearInterval(pollRef.current!)
            setAnalyzeStatus('complete')
            fetchOpportunity()
          } else if (status === 'FAILED') {
            clearInterval(pollRef.current!)
            setAnalyzeStatus('error')
          }
        } catch { /* non-fatal */ }
      }, 3000)
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

        {/* SAM.gov CTA — primary action */}
        {data.sourceUrl && (
          <a
            href={data.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open Full Solicitation on SAM.gov
          </a>
        )}

        {/* Description */}
        {data.description && (
          <div className="mt-5 border-t border-gray-800 pt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Description</p>
            <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{data.description}</p>
          </div>
        )}
      </div>

      {/* ── WIN PROBABILITY SCORE BREAKDOWN ─────────────────── */}
      <ScoreBreakdown
        breakdown={data.scoreBreakdown}
        probability={prob}
        estimatedValue={data.estimatedValue}
        expectedValue={data.expectedValue}
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
                        href={doc.fileUrl}
                        download={doc.fileName}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                      >
                        <Download className="w-3 h-3" /> Download
                      </a>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      doc.analysisStatus === 'COMPLETE' ? 'bg-green-900/40 text-green-300' :
                      doc.analysisStatus === 'RUNNING'  ? 'bg-blue-900/40 text-blue-300' :
                      doc.analysisStatus === 'FAILED'   ? 'bg-red-900/40 text-red-300' :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {doc.analysisStatus}
                    </span>
                  </div>
                </div>

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
