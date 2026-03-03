import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { opportunitiesApi, jobsApi, documentsApi } from '../services/api'
import {
  Upload, FileText, Loader, CheckCircle, AlertCircle,
  ExternalLink, Trophy, Users, TrendingUp, Shield
} from 'lucide-react'

interface Amendment {
  id: string
  title?: string
  description?: string
  amendmentNumber?: string
  postedDate?: string
}

interface Document {
  id: string
  fileName: string
  fileType: string
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
  responseDeadline: string
  probabilityScore?: number
  expectedValue?: number
  sourceUrl?: string
  setAsideType?: string
  estimatedValue?: number
  description?: string
  amendments?: Amendment[]
  documents?: Document[]
  // Enrichment fields
  isEnriched?: boolean
  historicalWinner?: string
  historicalAvgAward?: number
  historicalAwardCount?: number
  competitionCount?: number
  incumbentProbability?: number
  agencySdvosbRate?: number
  recompeteFlag?: boolean
  incumbentSignalDetected?: boolean
  scopeAlignmentScore?: number
  technicalComplexScore?: number
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [data, setData] = useState<OpportunityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [analyzeJobId, setAnalyzeJobId] = useState<string | null>(null)
  const [analyzeStatus, setAnalyzeStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle')
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
      const documentId = uploadRes.data.id

      // Trigger Claude analysis
      const jobRes = await jobsApi.triggerDocumentAnalysis(documentId)
      const jobId = jobRes.data.jobId
      setAnalyzeJobId(jobId)
      setAnalyzeStatus('running')

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const jobCheck = await jobsApi.getJob(jobId)
          if (jobCheck.data.status === 'COMPLETE') {
            clearInterval(pollRef.current!)
            setAnalyzeStatus('complete')
            fetchOpportunity() // Refresh with new scores
          } else if (jobCheck.data.status === 'FAILED') {
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

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>
  if (error) return <div className="p-6 text-red-500">Failed to load opportunity.</div>
  if (!data) return null

  const prob = data.probabilityScore ?? 0
  const probColor = prob >= 0.7 ? 'text-green-400' : prob >= 0.4 ? 'text-yellow-400' : 'text-gray-400'

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="text-blue-400 hover:text-blue-300 text-sm">
        ← Back to Opportunities
      </button>

      {/* Main Info Card */}
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-200 mb-1">{data.title}</h1>
            <p className="text-sm text-gray-500">{data.agency}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">Win Probability</p>
            <p className={`text-3xl font-bold font-mono ${probColor}`}>
              {Math.round(prob * 100)}%
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><p className="text-gray-500">NAICS Code</p><p className="text-gray-200 font-mono">{data.naicsCode}</p></div>
          <div>
            <p className="text-gray-500">Response Deadline</p>
            <p className="text-gray-200">{data.responseDeadline ? new Date(data.responseDeadline).toLocaleDateString() : 'N/A'}</p>
          </div>
          {data.setAsideType && data.setAsideType !== 'NONE' && (
            <div><p className="text-gray-500">Set-Aside</p><p className="text-gray-200">{data.setAsideType}</p></div>
          )}
          {data.estimatedValue != null && (
            <div><p className="text-gray-500">Estimated Value</p><p className="text-gray-200">${data.estimatedValue.toLocaleString()}</p></div>
          )}
          {data.expectedValue != null && data.expectedValue > 0 && (
            <div><p className="text-gray-500">Expected Value</p><p className="text-green-400 font-mono">${data.expectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div>
          )}
          {data.sourceUrl && (
            <div>
              <p className="text-gray-500">Source</p>
              <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300 flex items-center gap-1">
                View on SAM.gov <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {data.description && (
          <div className="mt-6 border-t border-gray-800 pt-4">
            <p className="text-gray-500 text-sm mb-2">Description</p>
            <p className="text-gray-300 text-sm whitespace-pre-wrap">{data.description}</p>
          </div>
        )}
      </div>

      {/* Enrichment Intelligence Card */}
      {data.isEnriched && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Award History Intelligence
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {data.historicalWinner && (
              <div className="md:col-span-2">
                <p className="text-gray-500 flex items-center gap-1"><Trophy className="w-3 h-3" /> Historical Winner</p>
                <p className="text-gray-200 font-medium truncate">{data.historicalWinner}</p>
                {data.incumbentProbability != null && (
                  <p className="text-xs text-yellow-400 mt-0.5">
                    Won {Math.round(data.incumbentProbability * 100)}% of awards
                  </p>
                )}
              </div>
            )}
            {data.competitionCount != null && (
              <div>
                <p className="text-gray-500 flex items-center gap-1"><Users className="w-3 h-3" /> Competitors</p>
                <p className="text-gray-200 font-mono">{data.competitionCount}</p>
              </div>
            )}
            {data.historicalAvgAward != null && data.historicalAvgAward > 0 && (
              <div>
                <p className="text-gray-500">Avg Award</p>
                <p className="text-gray-200 font-mono">${data.historicalAvgAward.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            )}
            {data.agencySdvosbRate != null && (
              <div>
                <p className="text-gray-500 flex items-center gap-1"><Shield className="w-3 h-3" /> Agency SDVOSB Rate</p>
                <p className="text-gray-200 font-mono">{Math.round(data.agencySdvosbRate * 100)}%</p>
              </div>
            )}
            {data.historicalAwardCount != null && (
              <div>
                <p className="text-gray-500">Total Awards (5yr)</p>
                <p className="text-gray-200 font-mono">{data.historicalAwardCount.toLocaleString()}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {data.recompeteFlag && (
              <span className="text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-700 px-2 py-1 rounded">Recompete Detected</span>
            )}
            {data.incumbentSignalDetected && (
              <span className="text-xs bg-orange-900/40 text-orange-300 border border-orange-700 px-2 py-1 rounded">Incumbent Signal</span>
            )}
          </div>
        </div>
      )}

      {/* Document Upload & Analysis Card */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-200 mb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" />
          Amendment Documents
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Upload SOW, amendments, or solicitation documents. Claude will analyze scope alignment and re-score this opportunity.
        </p>

        {/* Upload trigger */}
        <div className="flex items-center gap-3 mb-4">
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
            {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>

          {analyzeStatus === 'running' && (
            <div className="flex items-center gap-2 text-blue-300 text-sm">
              <Loader className="w-4 h-4 animate-spin" />
              Claude is analyzing document...
            </div>
          )}
          {analyzeStatus === 'complete' && (
            <div className="flex items-center gap-2 text-green-300 text-sm">
              <CheckCircle className="w-4 h-4" />
              Analysis complete — probability updated
            </div>
          )}
          {analyzeStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4" />
              Analysis failed
            </div>
          )}
        </div>

        {uploadError && <p className="text-red-400 text-xs mb-3">{uploadError}</p>}

        {/* Document list */}
        {data.documents && data.documents.length > 0 ? (
          <div className="space-y-3">
            {data.documents.map((doc) => (
              <div key={doc.id} className="border border-gray-800 rounded p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-200">{doc.fileName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    doc.analysisStatus === 'COMPLETE' ? 'bg-green-900/40 text-green-300' :
                    doc.analysisStatus === 'RUNNING'  ? 'bg-blue-900/40 text-blue-300' :
                    doc.analysisStatus === 'FAILED'   ? 'bg-red-900/40 text-red-300' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {doc.analysisStatus}
                  </span>
                </div>

                {doc.analysisStatus === 'COMPLETE' && (
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    {doc.alignmentScore != null && (
                      <div>
                        <p className="text-gray-500">Scope Alignment</p>
                        <p className={`font-mono font-semibold ${doc.alignmentScore >= 0.7 ? 'text-green-400' : doc.alignmentScore >= 0.4 ? 'text-yellow-400' : 'text-gray-400'}`}>
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
                        <p className="text-gray-500 mb-1">Incumbent Signals</p>
                        <div className="flex flex-wrap gap-1">
                          {doc.incumbentSignals.map((s, i) => (
                            <span key={i} className="bg-orange-900/30 text-orange-300 border border-orange-800 px-2 py-0.5 rounded text-xs">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {doc.scopeKeywords && doc.scopeKeywords.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-gray-500 mb-1">Scope Keywords</p>
                        <div className="flex flex-wrap gap-1">
                          {doc.scopeKeywords.slice(0, 10).map((kw, i) => (
                            <span key={i} className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-xs">{kw}</span>
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

      {/* Amendments */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Amendments</h2>
        {(!data.amendments || data.amendments.length === 0) ? (
          <p className="text-gray-500 text-sm">No amendments on record.</p>
        ) : (
          <div className="space-y-3">
            {data.amendments.map((a) => (
              <div key={a.id} className="border border-gray-800 rounded p-4">
                <div className="font-semibold text-gray-300">{a.title || `Amendment ${a.amendmentNumber}`}</div>
                {a.postedDate && <div className="text-xs text-gray-500 mb-2">{new Date(a.postedDate).toLocaleDateString()}</div>}
                {a.description && <div className="text-sm text-gray-400">{a.description}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
