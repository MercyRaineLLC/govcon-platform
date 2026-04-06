import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, CheckCircle, AlertTriangle, X, ArrowRight, Loader2, Building2, Hash, DollarSign, Calendar } from 'lucide-react'
import { api } from '../services/api'

type UploadState = 'idle' | 'uploading' | 'extracted' | 'error'

interface ExtractedData {
  opportunityId: string
  documentId: string
  extracted: {
    title: string
    agency: string
    naicsCode: string | null
    setAsideType: string
    estimatedValue: number | null
    responseDeadline: string
    description: string | null
    solicitationNumber: string | null
    noticeType: string
  }
}

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]
const ALLOWED_EXTS = ['.pdf', '.doc', '.docx', '.txt']

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export default function ContractUploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<ExtractedData | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<string>('')

  function validateFile(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.some(e => file.name.toLowerCase().endsWith(e))) {
      return 'Unsupported file type. Upload PDF, Word (.docx/.doc), or plain text files.'
    }
    if (file.size > 25 * 1024 * 1024) {
      return 'File too large. Maximum size is 25 MB.'
    }
    return null
  }

  const handleFile = useCallback((file: File) => {
    const err = validateFile(file)
    if (err) { setError(err); return }
    setSelectedFile(file)
    setError('')
    setState('idle')
    setResult(null)
  }, [])

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleUpload() {
    if (!selectedFile) return
    setState('uploading')
    setError('')
    setProgress('Uploading document...')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      setProgress('Extracting contract metadata with AI...')
      const response = await api.post('/contracts/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 2 minutes — AI extraction can be slow
      })

      if (response.data?.success) {
        setResult(response.data.data)
        setState('extracted')
        setProgress('')
      } else {
        throw new Error(response.data?.error || 'Upload failed')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message || 'Upload failed'
      setError(msg)
      setState('error')
      setProgress('')
    }
  }

  function reset() {
    setState('idle')
    setSelectedFile(null)
    setResult(null)
    setError('')
    setProgress('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <Upload className="w-5 h-5 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Upload Contract / RFP</h1>
        </div>
        <p className="text-sm text-slate-500 ml-14">
          Upload any PDF, Word, or text solicitation. AI will extract metadata, create an opportunity record, and queue document analysis.
        </p>
      </div>

      {/* Upload Zone */}
      {state !== 'extracted' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl p-10 text-center transition-all ${
            dragOver ? 'border-amber-500/60' : selectedFile ? 'border-emerald-500/40' : 'border-white/10 hover:border-white/20'
          }`}
          style={{
            border: `2px dashed ${dragOver ? 'rgba(245,158,11,0.5)' : selectedFile ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`,
            background: dragOver ? 'rgba(245,158,11,0.05)' : 'rgba(255,255,255,0.02)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={onFileInput}
          />
          {selectedFile ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 rounded-full" style={{ background: 'rgba(52,211,153,0.12)' }}>
                <FileText className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">{selectedFile.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Click to change
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <Upload className="w-8 h-8 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-400">Drop your contract or RFP here</p>
                <p className="text-xs text-slate-600 mt-1">PDF, Word (.docx), or plain text · Max 25 MB</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Upload Progress */}
      {state === 'uploading' && (
        <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
          <p className="text-sm text-amber-300">{progress || 'Processing...'}</p>
        </div>
      )}

      {/* Upload Button */}
      {selectedFile && state === 'idle' && (
        <button
          onClick={handleUpload}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.9), rgba(234,88,12,0.9))', color: '#0f172a' }}
        >
          <Upload className="w-4 h-4" />
          Upload &amp; Analyze Contract
        </button>
      )}

      {/* Retry after error */}
      {state === 'error' && selectedFile && (
        <div className="flex gap-3">
          <button
            onClick={handleUpload}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all"
            style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}
          >
            Retry Upload
          </button>
          <button
            onClick={reset}
            className="px-4 py-3 rounded-xl text-sm text-slate-500 hover:text-slate-300 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Extraction Results */}
      {state === 'extracted' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-300">Contract processed successfully</p>
          </div>

          <div className="rounded-xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Extracted Metadata</h3>

            <div>
              <p className="text-lg font-bold text-slate-100 leading-snug">{result.extracted.title}</p>
              {result.extracted.solicitationNumber && (
                <p className="text-xs text-slate-500 mt-0.5">Solicitation: {result.extracted.solicitationNumber}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <Building2 className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Agency</p>
                  <p className="text-sm text-slate-300">{result.extracted.agency}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Hash className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">NAICS Code</p>
                  <p className="text-sm text-slate-300">{result.extracted.naicsCode || 'Not detected'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Est. Value</p>
                  <p className="text-sm text-slate-300">
                    {result.extracted.estimatedValue ? fmt(result.extracted.estimatedValue) : 'Not stated'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Response Deadline</p>
                  <p className="text-sm text-slate-300">
                    {new Date(result.extracted.responseDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
                {result.extracted.noticeType}
              </span>
              {result.extracted.setAsideType !== 'NONE' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>
                  {result.extracted.setAsideType}
                </span>
              )}
            </div>

            {result.extracted.description && (
              <p className="text-xs text-slate-500 leading-relaxed border-t border-white/5 pt-3">
                {result.extracted.description}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/opportunities/${result.opportunityId}`)}
              className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.9), rgba(234,88,12,0.9))', color: '#0f172a' }}
            >
              Open Opportunity <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={reset}
              className="px-4 py-3 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
            >
              Upload Another
            </button>
          </div>

          <p className="text-[11px] text-slate-600 text-center">
            Document is queued for full AI analysis. Open the opportunity to run the compliance matrix and generate bid guidance.
          </p>
        </div>
      )}

      {/* Info card when idle and no file */}
      {state === 'idle' && !selectedFile && (
        <div className="rounded-xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">What happens after upload</p>
          <div className="space-y-2">
            {[
              ['AI Extraction', 'Title, agency, NAICS, deadline, estimated value, and scope are extracted automatically'],
              ['Opportunity Record', 'A new opportunity is created — visible in your Opportunities list'],
              ['Document Analysis', 'Document queues for scope analysis: complexity score, alignment, incumbent signals'],
              ['Bid Intelligence', 'Run compliance matrix and proposal assist from the opportunity detail page'],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50 mt-1.5 flex-shrink-0" />
                <div>
                  <span className="text-xs font-medium text-slate-400">{title}: </span>
                  <span className="text-xs text-slate-600">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
