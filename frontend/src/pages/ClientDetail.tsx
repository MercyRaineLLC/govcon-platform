import { useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clientsApi, clientDocumentsApi } from '../services/api'
import { PageHeader, Spinner, ErrorBanner, formatCurrency } from '../components/ui'
import {
  ArrowLeft, Shield, CheckCircle, XCircle, AlertTriangle,
  FileText, DollarSign, TrendingUp, Building2, Hash,
  Upload, Trash2, Share2, BookMarked, CheckCircle2,
  Phone, Globe, MapPin, CreditCard, CalendarClock,
} from 'lucide-react'

const DOC_TYPE_LABELS: Record<string, string> = {
  CAPABILITY_STATEMENT: 'Capability Statement',
  PAST_PERFORMANCE: 'Past Performance',
  TECHNICAL_PROPOSAL: 'Technical Proposal',
  MANAGEMENT_APPROACH: 'Management Approach',
  PRICE_VOLUME: 'Price/Cost Volume',
  SMALL_BUSINESS_PLAN: 'Small Business Plan',
  TEAMING_AGREEMENT: 'Teaming Agreement',
  COVER_LETTER: 'Cover Letter',
  OTHER: 'Other',
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['client', id],
    queryFn: () => clientsApi.getById(id!),
    enabled: !!id,
  })
  if (isLoading) return (
    <div className="flex justify-center mt-10"><Spinner size="lg" /></div>
  )
  if (error) return <ErrorBanner message="Failed to load client details." />
  const client = data?.data ?? data
  if (!client) return null

  const stats = client.performanceStats
  const submissions: any[] = client.submissionRecords ?? []
  const penalties: any[] = client.financialPenalties ?? []
  const certBadges = [
    { key: 'sdvosb', label: 'SDVOSB' },
    { key: 'wosb', label: 'WOSB' },
    { key: 'hubzone', label: 'HUBZone' },
    { key: 'smallBusiness', label: 'Small Business' },
  ].filter((b) => client[b.key])

  return (
    <div className="space-y-6 pb-12">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Clients
      </button>
      <PageHeader title={client.name} subtitle={client.uei ? 'UEI: ' + client.uei : 'Client Company'} />

      {/* Company Profile */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-400" /> Company Profile
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          {client.uei && (<div><p className="text-gray-500 text-xs mb-0.5">UEI</p><p className="text-gray-200 font-mono">{client.uei}</p></div>)}
          {client.cage && (<div><p className="text-gray-500 text-xs mb-0.5">CAGE Code</p><p className="text-gray-200 font-mono">{client.cage}</p></div>)}
          {client.ein && (
            <div>
              <p className="text-gray-500 text-xs mb-0.5 flex items-center gap-1"><CreditCard className="w-3 h-3" /> EIN / Tax ID</p>
              <p className="text-gray-200 font-mono">{client.ein}</p>
            </div>
          )}
          <div>
            <p className="text-gray-500 text-xs mb-0.5">Platform Status</p>
            <span className={'text-xs px-2 py-0.5 rounded ' + (client.isActive ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300')}>
              {client.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          {client.samRegStatus && (
            <div>
              <p className="text-gray-500 text-xs mb-0.5">SAM.gov Status</p>
              <span className={'text-xs px-2 py-0.5 rounded ' + (client.samRegStatus === 'Active' ? 'bg-green-900/40 text-green-300' : 'bg-yellow-900/40 text-yellow-300')}>
                {client.samRegStatus}
              </span>
              {client.samRegExpiry && (
                <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-0.5">
                  <CalendarClock className="w-3 h-3" /> Exp {new Date(client.samRegExpiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          )}
          {client.naicsCodes?.length > 0 && (
            <div className="col-span-2">
              <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Hash className="w-3 h-3" /> NAICS Codes</p>
              <div className="flex flex-wrap gap-1">
                {client.naicsCodes.map((code: string) => (
                  <span key={code} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono">{code}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Contact & Address */}
        {(client.phone || client.website || client.streetAddress) && (
          <div className="border-t border-gray-800 pt-3 mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
            {client.phone && (
              <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200">
                <Phone className="w-3.5 h-3.5 text-gray-600" /> {client.phone}
              </a>
            )}
            {client.website && (
              <a href={client.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 truncate max-w-xs">
                <Globe className="w-3.5 h-3.5" /> {client.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {client.streetAddress && (
              <span className="flex items-center gap-1.5 text-gray-400">
                <MapPin className="w-3.5 h-3.5 text-gray-600" />
                {client.streetAddress}{client.city ? `, ${client.city}` : ''}{client.state ? `, ${client.state}` : ''}{client.zipCode ? ` ${client.zipCode}` : ''}
              </span>
            )}
          </div>
        )}

        {certBadges.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {certBadges.map((b) => (
              <span key={b.key} className="flex items-center gap-1 text-xs bg-blue-900/40 text-blue-300 border border-blue-700 px-2 py-1 rounded">
                <Shield className="w-3 h-3" /> {b.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Performance Stats */}
      {stats && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" /> Performance Summary
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500 text-xs mb-0.5">Submissions</p>
              <p className="text-2xl font-bold font-mono text-gray-200">{stats.totalSubmitted ?? 0}</p></div>
            <div><p className="text-gray-500 text-xs mb-0.5">Completion Rate</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {(stats.completionRate ?? 0) >= 0.8 ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <p className="text-2xl font-bold font-mono text-gray-200">{Math.round((stats.completionRate ?? 0) * 100)}%</p>
              </div>
            </div>
            <div><p className="text-gray-500 text-xs mb-0.5">Win Rate</p>
              <p className="text-2xl font-bold font-mono text-green-400">{Math.round((stats.winRate ?? 0) * 100)}%</p></div>
            <div><p className="text-gray-500 text-xs mb-0.5">Total Penalties</p>
              <p className={'text-2xl font-bold font-mono ' + ((stats.totalPenalties ?? 0) > 0 ? 'text-red-400' : 'text-gray-400')}>
                {formatCurrency(stats.totalPenalties)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Submissions */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400" /> Recent Submissions
          <span className="text-xs text-gray-500 font-normal">(last 20)</span>
        </h2>
        {submissions.length === 0 ? (
          <p className="text-gray-500 text-sm">No submissions on record yet.</p>
        ) : (
          <div className="space-y-2">
            {submissions.map((s: any) => (
              <div key={s.id} className="flex items-start justify-between border border-gray-800 rounded-lg px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  {s.opportunity ? (
                    <Link to={'/opportunities/' + s.opportunity.id} className="text-blue-400 hover:text-blue-300 font-medium truncate block">
                      {s.opportunity.title}
                    </Link>
                  ) : (<p className="text-gray-300 font-medium">Unknown Opportunity</p>)}
                  {s.opportunity?.agency && <p className="text-xs text-gray-500 mt-0.5">{s.opportunity.agency}</p>}
                  <p className="text-xs text-gray-600 mt-0.5">
                    Submitted {new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-4">
                  <span className={'text-xs px-2 py-0.5 rounded ' + (s.status === 'AWARDED' ? 'bg-green-900/40 text-green-300' : s.status === 'SUBMITTED' ? 'bg-blue-900/40 text-blue-300' : s.status === 'REJECTED' ? 'bg-red-900/40 text-red-300' : 'bg-gray-800 text-gray-400')}>
                    {s.status}
                  </span>
                  {s.wasOnTime === false && (<span className="text-xs text-red-400 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> Late</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Financial Penalties */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-red-400" /> Financial Penalties
          <span className="text-xs text-gray-500 font-normal">(last 10)</span>
        </h2>
        {penalties.length === 0 ? (
          <p className="text-gray-500 text-sm">No penalties on record. Good standing.</p>
        ) : (
          <div className="space-y-2">
            {penalties.map((p: any) => (
              <div key={p.id} className="flex items-start justify-between border border-red-900/30 rounded-lg px-4 py-3 text-sm">
                <div>
                  <p className="text-gray-300">{p.reason || 'Penalty'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Applied {new Date(p.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <p className="text-red-400 font-mono font-semibold flex-shrink-0 ml-4">{formatCurrency(p.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Company Documents */}
      <ClientDocumentsSection clientCompanyId={id!} />
    </div>
  )
}

// ── CLIENT DOCUMENTS SECTION ──────────────────────────────────
function ClientDocumentsSection({ clientCompanyId }: { clientCompanyId: string }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ documentType: 'CAPABILITY_STATEMENT', title: '', notes: '' })
  const [shareForm, setShareForm] = useState<{ docId: string; title: string; description: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['client-documents', clientCompanyId],
    queryFn: () => clientDocumentsApi.list(clientCompanyId),
    enabled: !!clientCompanyId,
  })

  const docs: any[] = data?.data ?? []

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => clientDocumentsApi.delete(docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-documents', clientCompanyId] }),
  })

  const shareMutation = useMutation({
    mutationFn: ({ docId, title, description }: { docId: string; title: string; description: string }) =>
      clientDocumentsApi.shareAsTemplate(docId, { title, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-documents', clientCompanyId] })
      setShareForm(null)
    },
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!form.title.trim()) { setUploadError('Please enter a title before uploading.'); return }
    setUploading(true); setUploadError('')
    try {
      await clientDocumentsApi.upload({ clientCompanyId, ...form }, file)
      qc.invalidateQueries({ queryKey: ['client-documents', clientCompanyId] })
      setForm({ documentType: 'CAPABILITY_STATEMENT', title: '', notes: '' })
    } catch (err: any) {
      setUploadError(err?.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-gray-200 mb-1 flex items-center gap-2">
        <BookMarked className="w-4 h-4 text-blue-400" /> Company Documents
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Upload branded documents (Capability Statements, Past Performance write-ups, etc.).
        You can anonymize and contribute any document to the shared Template Library.
      </p>

      {/* Upload form */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="label">Document Type</label>
            <select className="input" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="e.g. Capability Statement 2025" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input className="input" placeholder="e.g. Used for VA contracts" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        {uploadError && <p className="text-red-400 text-xs mb-2">{uploadError}</p>}
        <input ref={fileRef} type="file" accept=".docx,.txt,.md" className="hidden" onChange={handleUpload} />
        <button
          onClick={() => {
            if (!form.title.trim()) { setUploadError('Enter a title first'); return }
            setUploadError('')
            fileRef.current?.click()
          }}
          disabled={uploading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          {uploading
            ? <><Upload className="w-4 h-4 animate-pulse" /> Uploading...</>
            : <><Upload className="w-4 h-4" /> Choose File & Upload (.docx or .txt)</>}
        </button>
      </div>

      {/* Share as Template modal */}
      {shareForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-200 mb-1 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-blue-400" /> Contribute to Template Library
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Your document will be anonymized — company names, emails, phone numbers, and contract numbers are replaced with placeholders.
              It will be reviewed before becoming publicly available to all platform subscribers.
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Template Title *</label>
                <input className="input" value={shareForm.title} onChange={(e) => setShareForm({ ...shareForm, title: e.target.value })} placeholder="e.g. SDVOSB IT Capability Statement" />
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <textarea
                  className="input h-20 resize-none"
                  value={shareForm.description}
                  onChange={(e) => setShareForm({ ...shareForm, description: e.target.value })}
                  placeholder="What contract type, agency, or industry is this best suited for?"
                />
              </div>
              {shareMutation.isError && (
                <p className="text-red-400 text-xs">{(shareMutation.error as any)?.response?.data?.error || 'Submission failed'}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => shareMutation.mutate(shareForm)}
                  disabled={!shareForm.title.trim() || shareMutation.isPending}
                  className="btn-primary flex-1"
                >
                  {shareMutation.isPending ? 'Submitting...' : 'Anonymize & Submit for Review'}
                </button>
                <button onClick={() => setShareForm(null)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Documents list */}
      {isLoading && <p className="text-gray-500 text-sm">Loading...</p>}
      {!isLoading && docs.length === 0 && (
        <p className="text-gray-600 text-sm italic">No documents uploaded yet for this client.</p>
      )}
      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc: any) => (
            <div key={doc.id} className="flex items-start justify-between border border-gray-800 rounded-lg px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-gray-200 font-medium">{doc.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType} &middot; {doc.fileName} &middot; {(doc.fileSize / 1024).toFixed(0)} KB
                </p>
                {doc.notes && <p className="text-xs text-gray-600 mt-0.5 italic">{doc.notes}</p>}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                {doc.isSharedAsTemplate ? (
                  <span className="text-xs flex items-center gap-1 text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {doc.sharedTemplate?.status === 'APPROVED' ? 'In Library' : 'Pending Review'}
                  </span>
                ) : (
                  <button
                    onClick={() => setShareForm({ docId: doc.id, title: doc.title + ' Template', description: '' })}
                    title="Contribute to template library"
                    className="text-gray-600 hover:text-blue-400 transition-colors text-xs flex items-center gap-1"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                )}
                <a
                  href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/client-documents/${doc.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-600 hover:text-blue-400 transition-colors"
                  title="Download"
                >
                  <FileText className="w-4 h-4" />
                </a>
                <button
                  onClick={() => { if (window.confirm('Delete this document?')) deleteMutation.mutate(doc.id) }}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
