import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle, Shield, Zap, Star, Loader } from 'lucide-react'
import axios from 'axios'

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

interface FormState {
  email: string
  contactName: string
  firmName: string
  naicsFocus: string
  notes: string
}

const EMPTY: FormState = {
  email: '',
  contactName: '',
  firmName: '',
  naicsFocus: '',
  notes: '',
}

export default function BetaAccess() {
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Capture attribution from query string (?source=billing, etc.) for source tracking.
  const source = searchParams.get('source') || 'landing'

  useEffect(() => {
    document.title = 'Request Beta Access — MrGovCon'
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await axios.post(`${API_BASE}/api/beta/request`, {
        email: form.email.trim(),
        contactName: form.contactName.trim() || undefined,
        firmName: form.firmName.trim() || undefined,
        naicsFocus: form.naicsFocus.trim() || undefined,
        notes: form.notes.trim() || undefined,
        source,
      })
      if (res.data?.success) {
        setSubmitted(true)
      } else {
        setErrorMsg(res.data?.error || 'Submission failed. Please try again.')
      }
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || err?.message || 'Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#040d1a' }}>
        <div className="max-w-md w-full text-center card-gold py-12 px-8" style={{ borderRadius: '16px' }}>
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-12 h-12 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Request received</h1>
          <p className="text-sm text-slate-400 mb-6">
            Thanks for your interest in MrGovCon. We'll review your request and reach out within 2 business days.
          </p>
          <Link to="/" className="text-sm text-amber-400 hover:text-amber-300 inline-flex items-center gap-1">
            ← Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-6 py-12" style={{ background: '#040d1a' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 mb-3">
            Beta Access · Invite-Only
          </p>
          <h1 className="text-3xl font-black text-slate-100 mb-3" style={{ letterSpacing: '-0.02em' }}>
            Request Access to MrGovCon
          </h1>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            We're onboarding a limited cohort of federal contracting consultants and freight brokerage operators.
            Tell us a bit about your firm and we'll reach out with next steps.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="card-gold p-6 space-y-4" style={{ borderRadius: '12px' }}>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Work email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                required
                autoFocus
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500 transition-colors"
                placeholder="you@yourfirm.com"
                disabled={submitting}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Your name</label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500 transition-colors"
                  placeholder="Jane Smith"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Firm name</label>
                <input
                  type="text"
                  value={form.firmName}
                  onChange={(e) => setForm({ ...form, firmName: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500 transition-colors"
                  placeholder="Acme Federal Services"
                  disabled={submitting}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Primary NAICS code (optional)
              </label>
              <input
                type="text"
                value={form.naicsFocus}
                onChange={(e) => setForm({ ...form, naicsFocus: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500 transition-colors"
                placeholder="e.g., 541512"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                What are you trying to solve? (optional)
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500 transition-colors resize-none"
                placeholder="Tell us about your bid pipeline, current tooling, or specific pain points."
                disabled={submitting}
              />
            </div>

            {errorMsg && (
              <div className="text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !form.email.trim()}
              className="btn-primary w-full text-sm py-3 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  Request Access <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Trust strip */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500 mt-8">
          <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-amber-600" /> SDVOSB Operated</span>
          <span className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-600" /> Invite-only beta</span>
          <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-amber-600" /> No payment during beta</span>
        </div>

        <div className="text-center mt-6">
          <Link to="/" className="text-xs text-slate-600 hover:text-slate-400 inline-flex items-center gap-1">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
