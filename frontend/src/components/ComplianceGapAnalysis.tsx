import { useState, useEffect } from 'react'
import { Shield, AlertTriangle, FileText, CheckCircle, ChevronDown, ChevronRight, Loader, AlertCircle } from 'lucide-react'
import axios from 'axios'

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

interface ComplianceGap {
  clauseCode: string
  category: 'FAR' | 'DFARS' | 'SET_ASIDE'
  title: string
  shortDescription: string
  plainLanguage: string
  requirementType: string
  documentNeeded?: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  detected: boolean
  status: 'GAP' | 'MET' | 'UNKNOWN'
  recommendation: string
}

interface AnalysisResult {
  opportunityId: string
  opportunityTitle: string
  agency: string
  setAsideType: string | null
  totalClauses: number
  criticalGaps: number
  highGaps: number
  mediumGaps: number
  lowGaps: number
  gaps: ComplianceGap[]
  recommendations: string[]
}

interface Props {
  opportunityId: string
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  CRITICAL: { bg: 'bg-red-950/40', border: 'border-red-800', text: 'text-red-300', icon: 'text-red-400' },
  HIGH: { bg: 'bg-orange-950/40', border: 'border-orange-800', text: 'text-orange-300', icon: 'text-orange-400' },
  MEDIUM: { bg: 'bg-yellow-950/40', border: 'border-yellow-800', text: 'text-yellow-300', icon: 'text-yellow-400' },
  LOW: { bg: 'bg-blue-950/40', border: 'border-blue-800', text: 'text-blue-300', icon: 'text-blue-400' },
}

const CATEGORY_BADGE: Record<string, string> = {
  FAR: 'bg-blue-900/40 text-blue-300 border-blue-700',
  DFARS: 'bg-purple-900/40 text-purple-300 border-purple-700',
  SET_ASIDE: 'bg-green-900/40 text-green-300 border-green-700',
}

export function ComplianceGapAnalysis({ opportunityId }: Props) {
  const [data, setData] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedClause, setExpandedClause] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    axios
      .get(`${API_BASE}/api/compliance-matrix/${opportunityId}/gap-analysis`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      })
      .then((res) => {
        if (!cancelled) setData(res.data.data)
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.response?.data?.error || 'Failed to load gap analysis')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [opportunityId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-5 h-5 animate-spin text-gray-500" />
        <span className="ml-2 text-sm text-gray-500">Analyzing compliance requirements...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg p-4 text-sm flex gap-2">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <p>{error || 'No analysis available'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-semibold text-gray-100">Compliance Gap Analysis</h2>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-red-950/30 border border-red-800/60 rounded-lg p-3">
          <p className="text-xs text-red-400 mb-1">Critical</p>
          <p className="text-2xl font-bold text-red-300">{data.criticalGaps}</p>
        </div>
        <div className="bg-orange-950/30 border border-orange-800/60 rounded-lg p-3">
          <p className="text-xs text-orange-400 mb-1">High</p>
          <p className="text-2xl font-bold text-orange-300">{data.highGaps}</p>
        </div>
        <div className="bg-yellow-950/30 border border-yellow-800/60 rounded-lg p-3">
          <p className="text-xs text-yellow-400 mb-1">Medium</p>
          <p className="text-2xl font-bold text-yellow-300">{data.mediumGaps}</p>
        </div>
        <div className="bg-blue-950/30 border border-blue-800/60 rounded-lg p-3">
          <p className="text-xs text-blue-400 mb-1">Low</p>
          <p className="text-2xl font-bold text-blue-300">{data.lowGaps}</p>
        </div>
      </div>

      {/* Top recommendations */}
      {data.recommendations.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Action Required</p>
          <ul className="space-y-1.5">
            {data.recommendations.map((r, i) => (
              <li key={i} className="text-sm text-gray-300">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Gaps list */}
      <div className="space-y-2">
        {data.gaps.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
            No compliance gaps detected for this opportunity.
          </div>
        ) : (
          data.gaps.map((gap) => {
            const style = SEVERITY_STYLES[gap.severity]
            const isExpanded = expandedClause === gap.clauseCode
            return (
              <div
                key={gap.clauseCode}
                className={`border rounded-lg ${style.border} ${style.bg} cursor-pointer transition-colors`}
                onClick={() => setExpandedClause(isExpanded ? null : gap.clauseCode)}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${CATEGORY_BADGE[gap.category]}`}>
                          {gap.category}
                        </span>
                        <span className={`text-[10px] uppercase tracking-wider font-bold ${style.text}`}>
                          {gap.severity}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">{gap.clauseCode}</span>
                      </div>
                      <h3 className={`font-medium text-sm ${style.text}`}>{gap.title}</h3>
                      <p className="text-xs text-gray-400 mt-1">{gap.shortDescription}</p>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-800 space-y-3">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">What this means in plain language</p>
                        <p className="text-sm text-gray-300 leading-relaxed">{gap.plainLanguage}</p>
                      </div>

                      {gap.documentNeeded && (
                        <div className="flex items-start gap-2 bg-gray-900/60 rounded p-2.5">
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs uppercase tracking-wider text-gray-500 mb-0.5">Document Needed</p>
                            <p className="text-sm text-gray-300">{gap.documentNeeded}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-2 bg-blue-950/30 border border-blue-900/50 rounded p-2.5">
                        <AlertTriangle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs uppercase tracking-wider text-blue-400 mb-0.5">Recommendation</p>
                          <p className="text-sm text-gray-300">{gap.recommendation}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
