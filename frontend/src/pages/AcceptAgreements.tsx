import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FileText, Loader, ArrowLeft, ShieldCheck } from 'lucide-react'
import { authApi } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'

interface LegalDoc {
  version: string
  title: string
  contentHash: string
  body: string
  effectiveAt: string
}

interface LegalPayload {
  tos: LegalDoc
  betaNda: LegalDoc
}

/**
 * Login gate-2 — accept current ToS + Beta NDA. Reached when login
 * returns code='AGREEMENT_REQUIRED' with a scoped completionToken.
 *
 * Loads the current docs from /api/auth/legal/current, displays each
 * with its version pinned, and on submit calls /complete-agreements.
 * The endpoint either returns a full session ({ token, user, firm })
 * or hands off to /beta-questionnaire with a new scoped token.
 */
export function AcceptAgreementsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const { toast } = useToast()

  const navState = (location.state ?? {}) as {
    completionToken?: string
    email?: string
  }
  const completionToken = navState.completionToken

  const [docs, setDocs] = useState<LegalPayload | null>(null)
  const [tosOk, setTosOk] = useState(false)
  const [ndaOk, setNdaOk] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!completionToken) {
      setError('Missing completion token. Please sign in again.')
      setLoading(false)
      return
    }
    let cancelled = false
    authApi
      .legalCurrent()
      .then((res) => {
        if (cancelled) return
        if (res?.success && res?.data) {
          setDocs(res.data)
        } else {
          setError('Could not load the current legal documents.')
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the current legal documents.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [completionToken])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!docs || !completionToken) return
    if (!tosOk || !ndaOk) {
      setError('Please confirm both agreements before continuing.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const res = await authApi.completeAgreements(docs.tos.version, docs.betaNda.version, completionToken)
      if (res?.success && res?.data?.token) {
        login(res.data.token, res.data.user, res.data.firm)
        toast('Agreements recorded — welcome.', 'success')
        navigate('/')
        return
      }
      setError(res?.error || 'Could not complete agreement acceptance.')
    } catch (err: any) {
      const code = err?.response?.data?.code
      const data = err?.response?.data
      if (code === 'BETA_QUESTIONNAIRE_REQUIRED') {
        // Hand off to gate-3 with the new scoped token.
        navigate('/beta-questionnaire', {
          state: {
            completionToken: data?.completionToken,
            questionnaireId: data?.questionnaireId,
            email: navState.email,
          },
        })
        return
      }
      if (code === 'TOS_VERSION_MISMATCH' || code === 'NDA_VERSION_MISMATCH') {
        setError('The legal documents were updated again while this page was open. Reloading…')
        setTimeout(() => window.location.reload(), 1200)
        return
      }
      setError(data?.error || err?.message || 'Submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: '#040d1a' }}>
      <div
        className="w-full max-w-3xl rounded-xl p-8"
        style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(245,158,11,0.25)' }}
      >
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-7 h-7 text-amber-400" aria-hidden="true" />
          <h1 className="text-xl font-bold text-slate-100">Updated Agreements</h1>
        </div>
        <p className="text-sm text-slate-400 mb-6">
          Our Terms of Service and Beta NDA have been updated since you last signed in.
          Review and accept the current versions to continue.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader className="w-4 h-4 animate-spin" /> Loading documents…
          </div>
        )}

        {!loading && error && !docs && (
          <div className="rounded-lg p-4 mb-4" style={{ background: 'rgba(127,29,29,0.4)', border: '1px solid rgba(185,28,28,0.5)', color: '#fca5a5' }}>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-3 text-xs text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Back to sign in
            </button>
          </div>
        )}

        {!loading && docs && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <DocumentBlock
              icon={<FileText className="w-5 h-5 text-amber-400" />}
              title={docs.tos.title}
              version={docs.tos.version}
              effectiveAt={docs.tos.effectiveAt}
              body={docs.tos.body}
              checked={tosOk}
              onChange={setTosOk}
              ariaLabel="Accept Terms of Service"
              checkboxLabel={`I have read and accept the Terms of Service v${docs.tos.version}.`}
            />

            <DocumentBlock
              icon={<FileText className="w-5 h-5 text-amber-400" />}
              title={docs.betaNda.title}
              version={docs.betaNda.version}
              effectiveAt={docs.betaNda.effectiveAt}
              body={docs.betaNda.body}
              checked={ndaOk}
              onChange={setNdaOk}
              ariaLabel="Accept Beta NDA"
              checkboxLabel={`I have read and accept the Beta NDA v${docs.betaNda.version}.`}
            />

            {error && (
              <div role="alert" className="text-sm rounded-lg px-4 py-3" style={{ background: 'rgba(127,29,29,0.4)', border: '1px solid rgba(185,28,28,0.5)', color: '#fca5a5' }}>
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-xs text-slate-500 hover:text-slate-300 inline-flex items-center gap-1"
                disabled={submitting}
              >
                <ArrowLeft className="w-3 h-3" /> Back to sign in
              </button>
              <button
                type="submit"
                disabled={submitting || !tosOk || !ndaOk}
                className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" /> Recording…
                  </>
                ) : (
                  <>Accept &amp; Continue →</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}

interface DocumentBlockProps {
  icon: React.ReactNode
  title: string
  version: string
  effectiveAt: string
  body: string
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
  checkboxLabel: string
}

function DocumentBlock({ icon, title, version, effectiveAt, body, checked, onChange, ariaLabel, checkboxLabel }: DocumentBlockProps) {
  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(245,158,11,0.2)' }}
    >
      <header
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          v{version} · effective {new Date(effectiveAt).toLocaleDateString()}
        </div>
      </header>
      <div
        className="px-4 py-3 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed overflow-y-auto"
        style={{ maxHeight: '14rem', background: 'rgba(15,23,42,0.6)' }}
      >
        {body}
      </div>
      <label className="flex items-start gap-2 px-4 py-3 cursor-pointer" style={{ background: 'rgba(15,23,42,0.4)' }}>
        <input
          type="checkbox"
          aria-label={ariaLabel}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 w-4 h-4 cursor-pointer accent-amber-500"
        />
        <span className="text-xs text-slate-300">{checkboxLabel}</span>
      </label>
    </section>
  )
}

export default AcceptAgreementsPage
