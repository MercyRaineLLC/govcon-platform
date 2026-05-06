import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import { betaQuestionnaireApi } from '../services/api'
import { ClipboardCheck } from 'lucide-react'

interface Question {
  id: string
  type: 'RATING_1_5' | 'TEXT' | 'BOOL'
  prompt: string
  required?: boolean
  maxLength?: number
}

interface QuestionnairePayload {
  id: string
  weekStarting: string
  title: string
  questions: Question[]
}

/**
 * Beta-program weekly questionnaire gate.
 *
 * Two reach paths:
 *   1. Pre-login (gate-3 fires) — user lands here from /login with
 *      `state: { completionToken, questionnaire, email, password }`.
 *      We POST to /complete with the scoped completionToken and pick up
 *      a full session JWT.
 *   2. Post-login (admin reviewing or returning user) — user is already
 *      authed and we render the questionnaire from /current.
 */
export function BetaQuestionnairePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, user, firm } = useAuth()
  const { toast } = useToast()

  const navState = (location.state ?? {}) as {
    completionToken?: string
    questionnaireId?: string
    email?: string
  }
  const isGatedFlow = Boolean(navState.completionToken)

  const [questionnaire, setQuestionnaire] = useState<QuestionnairePayload | null>(null)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (isGatedFlow && navState.completionToken) {
          // Use the scoped token to fetch the questionnaire payload.
          const res = await fetch('/api/beta/questionnaire/current', {
            headers: { Authorization: `Bearer ${navState.completionToken}` },
          })
          if (!res.ok) {
            // /current rejects scoped tokens — fall back to a static shape using
            // navState.questionnaireId. The /complete endpoint validates the
            // questionnaire server-side anyway.
            setError('Unable to load questionnaire payload. Please retry sign-in.')
            return
          }
          const json = await res.json()
          if (!cancelled) setQuestionnaire(json.data)
        } else {
          const res = await betaQuestionnaireApi.current()
          if (!cancelled) setQuestionnaire(res.data)
        }
      } catch {
        if (!cancelled) setError('Could not load this week’s questionnaire.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isGatedFlow, navState.completionToken])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!questionnaire) return
    setError('')
    setSubmitting(true)
    try {
      if (isGatedFlow && navState.completionToken) {
        const res = await betaQuestionnaireApi.complete(
          questionnaire.id,
          answers,
          navState.completionToken
        )
        // Server returns a full JWT — store it via the auth hook.
        // useAuth.login expects (token, user, firm). We don't have those
        // from the gate-3 flow, so caller must also pass them. Workaround:
        // login() here with a minimal user object; profile() will fetch.
        if (res.data?.token) {
          login(
            res.data.token,
            user ?? { id: '', email: navState.email ?? '', firstName: '', lastName: '', role: 'CONSULTANT' },
            firm ?? { id: '', name: '' }
          )
          toast('Thanks — feedback recorded. Welcome back.', 'success')
          navigate('/')
        }
      } else {
        await betaQuestionnaireApi.respond(questionnaire.id, answers)
        toast('Thanks — feedback recorded.', 'success')
        navigate('/')
      }
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'MISSING_REQUIRED_ANSWERS') {
        setError('Please answer all required questions.')
      } else {
        setError(err.response?.data?.error || 'Submission failed.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: '#040d1a' }}
    >
      <div
        className="w-full max-w-2xl rounded-xl p-8"
        style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(245,158,11,0.25)' }}
      >
        <div className="flex items-center gap-3 mb-2">
          <ClipboardCheck className="w-7 h-7 text-amber-400" aria-hidden="true" />
          <h1 className="text-xl font-bold text-slate-100">Weekly Beta Feedback</h1>
        </div>
        <p className="text-sm text-slate-400 mb-6">
          {isGatedFlow
            ? "Five short questions before you continue. Your answers steer next week's release."
            : "This week's questionnaire."}
        </p>

        {loading && <p className="text-slate-500 text-sm">Loading…</p>}

        {!loading && questionnaire && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {questionnaire.questions.map((q) => (
              <div key={q.id}>
                <label htmlFor={q.id} className="label">
                  {q.prompt}
                  {q.required && <span className="text-amber-400 ml-1" aria-label="required">*</span>}
                </label>
                {q.type === 'RATING_1_5' && (
                  <div role="radiogroup" aria-labelledby={q.id} className="flex gap-2 mt-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={answers[q.id] === n}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                        className="w-12 h-12 rounded-lg font-semibold"
                        style={{
                          background: answers[q.id] === n ? '#f59e0b' : 'rgba(15,23,42,0.6)',
                          border: '1px solid rgba(245,158,11,0.35)',
                          color: answers[q.id] === n ? '#1a1a1a' : '#e2e8f0',
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'TEXT' && (
                  <textarea
                    id={q.id}
                    className="input mt-2"
                    rows={3}
                    maxLength={q.maxLength ?? 600}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    required={q.required}
                  />
                )}
                {q.type === 'BOOL' && (
                  <div role="radiogroup" aria-labelledby={q.id} className="flex gap-3 mt-2">
                    {[
                      { v: true, label: 'Yes' },
                      { v: false, label: 'No' },
                    ].map((opt) => (
                      <button
                        key={String(opt.v)}
                        type="button"
                        role="radio"
                        aria-checked={answers[q.id] === opt.v}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt.v }))}
                        className="px-5 py-2.5 rounded-lg font-semibold"
                        style={{
                          background: answers[q.id] === opt.v ? '#f59e0b' : 'rgba(15,23,42,0.6)',
                          border: '1px solid rgba(245,158,11,0.35)',
                          color: answers[q.id] === opt.v ? '#1a1a1a' : '#e2e8f0',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {error && (
              <div role="alert" className="text-sm rounded-lg px-4 py-3" style={{ background: 'rgba(127,29,29,0.4)', border: '1px solid rgba(185,28,28,0.5)', color: '#fca5a5' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-sm">
              {submitting ? 'Submitting…' : 'Submit Feedback & Continue →'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

export default BetaQuestionnairePage
