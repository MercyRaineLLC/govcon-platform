import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clientDocumentsApi } from '../services/api'
import { PageHeader, Spinner, ErrorBanner, EmptyState } from '../components/ui'
import { BookMarked, Download, FileText, BookOpen, Briefcase, Users, DollarSign, Shield, FileCheck, Mail } from 'lucide-react'

const DOC_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'CAPABILITY_STATEMENT', label: 'Capability Statement' },
  { value: 'PAST_PERFORMANCE', label: 'Past Performance' },
  { value: 'TECHNICAL_PROPOSAL', label: 'Technical Proposal' },
  { value: 'MANAGEMENT_APPROACH', label: 'Management Approach' },
  { value: 'PRICE_VOLUME', label: 'Price/Cost Volume' },
  { value: 'SMALL_BUSINESS_PLAN', label: 'Small Business Plan' },
  { value: 'TEAMING_AGREEMENT', label: 'Teaming Agreement' },
  { value: 'COVER_LETTER', label: 'Cover Letter' },
  { value: 'OTHER', label: 'Other' },
]

const TYPE_ICONS: Record<string, any> = {
  CAPABILITY_STATEMENT: Briefcase,
  PAST_PERFORMANCE: FileCheck,
  TECHNICAL_PROPOSAL: BookOpen,
  MANAGEMENT_APPROACH: Users,
  PRICE_VOLUME: DollarSign,
  SMALL_BUSINESS_PLAN: Shield,
  TEAMING_AGREEMENT: Users,
  COVER_LETTER: Mail,
  OTHER: FileText,
}

const TYPE_COLORS: Record<string, string> = {
  CAPABILITY_STATEMENT: 'bg-blue-900/40 text-blue-300 border-blue-700',
  PAST_PERFORMANCE: 'bg-green-900/40 text-green-300 border-green-700',
  TECHNICAL_PROPOSAL: 'bg-purple-900/40 text-purple-300 border-purple-700',
  MANAGEMENT_APPROACH: 'bg-cyan-900/40 text-cyan-300 border-cyan-700',
  PRICE_VOLUME: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  SMALL_BUSINESS_PLAN: 'bg-orange-900/40 text-orange-300 border-orange-700',
  TEAMING_AGREEMENT: 'bg-pink-900/40 text-pink-300 border-pink-700',
  COVER_LETTER: 'bg-indigo-900/40 text-indigo-300 border-indigo-700',
  OTHER: 'bg-gray-800 text-gray-400 border-gray-700',
}

export default function TemplateLibrary() {
  const [selectedType, setSelectedType] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['templates', selectedType],
    queryFn: () => clientDocumentsApi.listTemplates({ documentType: selectedType || undefined, limit: 50 }),
  })

  const templates: any[] = data?.data ?? []

  const handleDownload = async (template: any) => {
    setDownloading(template.id)
    try {
      const safeName = template.title.replace(/[^a-zA-Z0-9- ]/g, '').trim().replace(/ /g, '_')
      await clientDocumentsApi.downloadTemplate(template.id, safeName + '_template.txt')
    } catch {
      // non-fatal
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Template Library"
        subtitle="Community-contributed, anonymized document templates for government contracting"
      />

      <div className="card bg-blue-950/20 border-blue-900/40">
        <div className="flex items-start gap-3">
          <BookMarked className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-200">How templates work</p>
            <p className="text-xs text-gray-500 mt-1">
              Templates are real documents submitted by firms like yours — with company names, emails, and identifying info removed.
              Upload your own branded documents from a client's profile page and share them to contribute to the community library.
              All submissions are reviewed before becoming available here.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {DOC_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setSelectedType(t.value)}
            className={'text-xs px-3 py-1.5 rounded-full border transition-colors ' + (
              selectedType === t.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="flex justify-center mt-10"><Spinner size="lg" /></div>}
      {error && <ErrorBanner message="Failed to load templates" />}
      {!isLoading && templates.length === 0 && (
        <EmptyState message="No templates available yet. Be the first to contribute — upload a document from any client profile." />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t: any) => {
          const Icon = TYPE_ICONS[t.documentType] ?? FileText
          const colorClass = TYPE_COLORS[t.documentType] ?? TYPE_COLORS.OTHER
          return (
            <div key={t.id} className="card hover:border-gray-600 transition-colors flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className={'p-2 rounded-lg border ' + colorClass}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200 leading-snug">{t.title}</p>
                  <span className={'text-xs px-1.5 py-0.5 rounded border mt-1 inline-block ' + colorClass}>
                    {DOC_TYPES.find((d) => d.value === t.documentType)?.label ?? t.documentType}
                  </span>
                </div>
              </div>

              {t.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{t.description}</p>
              )}

              <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-800">
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <Download className="w-3 h-3" />
                  {(t.downloadCount ?? 0).toLocaleString()} downloads
                </div>
                <button
                  onClick={() => handleDownload(t)}
                  disabled={downloading === t.id}
                  className="btn-primary text-xs flex items-center gap-1.5 py-1.5 px-3"
                >
                  <Download className="w-3 h-3" />
                  {downloading === t.id ? 'Downloading...' : 'Download Template'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
