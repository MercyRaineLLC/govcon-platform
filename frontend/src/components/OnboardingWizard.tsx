import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, CheckCircle, ArrowRight, Building2, Users, Search, BarChart3, X } from 'lucide-react'

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to GovCon Intelligence',
    subtitle: 'Your AI-powered federal contracting advisory platform',
    icon: Shield,
    color: 'text-blue-400',
    bg: 'bg-blue-900/20 border-blue-700',
    content: 'Set up takes about 5 minutes. We will guide you through adding your firm profile, clients, and pulling your first federal opportunities.',
  },
  {
    id: 'firm',
    title: 'Step 1: Your Firm Profile',
    subtitle: 'Tell us about your consulting practice',
    icon: Building2,
    color: 'text-purple-400',
    bg: 'bg-purple-900/20 border-purple-700',
    content: 'Your firm profile is used to scope all data and reports. Go to Settings to update your firm name, penalty thresholds, and notification preferences.',
    action: { label: 'Go to Settings', path: '/settings' },
  },
  {
    id: 'clients',
    title: 'Step 2: Add Your Clients',
    subtitle: 'Register your government contracting clients',
    icon: Users,
    color: 'text-green-400',
    bg: 'bg-green-900/20 border-green-700',
    content: 'Each client gets scored against federal opportunities. Add their NAICS codes, certifications (SDVOSB, WOSB, 8a, HUBZone), UEI, and CAGE code for best results.',
    action: { label: 'Add Clients', path: '/clients' },
  },
  {
    id: 'opportunities',
    title: 'Step 3: Pull Federal Opportunities',
    subtitle: 'Ingest live solicitations from SAM.gov',
    icon: Search,
    color: 'text-yellow-400',
    bg: 'bg-yellow-900/20 border-yellow-700',
    content: 'Click Ingest SAM.gov on the Opportunities page to pull the latest federal contract solicitations. The platform auto-scores each opportunity against your clients.',
    action: { label: 'View Opportunities', path: '/opportunities' },
  },
  {
    id: 'analytics',
    title: 'Step 4: Explore Analytics',
    subtitle: 'Win probability, pipeline forecasting, and risk radar',
    icon: BarChart3,
    color: 'text-cyan-400',
    bg: 'bg-cyan-900/20 border-cyan-700',
    content: 'The Analytics dashboard provides trend analysis, market intelligence, Monte Carlo revenue forecasting, and risk indicators across your entire client portfolio.',
    action: { label: 'Open Analytics', path: '/analytics' },
  },
]

interface OnboardingWizardProps {
  onClose: () => void
}

export function OnboardingWizard({ onClose }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  const handleAction = () => {
    if (current.action) navigate(current.action.path)
    if (!isLast) setStep((s) => s + 1)
  }

  const handleFinish = () => {
    localStorage.setItem('govcon_onboarded', 'true')
    onClose()
  }
  return (
    <div className='fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
      <div className='bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl'>
        {/* Header */}
        <div className='flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-800'>
          <div className='flex items-center gap-2'>
            <Shield className='w-5 h-5 text-blue-400' />
            <span className='text-sm font-medium text-gray-300'>Setup Wizard</span>
          </div>
          <button onClick={handleFinish} className='text-gray-500 hover:text-gray-300 transition-colors'>
            <X className='w-5 h-5' />
          </button>
        </div>

        {/* Progress */}
        <div className='px-6 py-4'>
          <div className='flex gap-1.5 mb-6'>
            {STEPS.map((_, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i <= step ? 'bg-blue-500' : 'bg-gray-700'}`} />
            ))}
          </div>

          {/* Step content */}
          <div className={`border rounded-xl p-5 mb-6 ${current.bg}`}>
            <div className='flex items-start gap-4'>
              <div className='flex-shrink-0 w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center'>
                <Icon className={`w-5 h-5 ${current.color}`} />
              </div>
              <div>
                <h2 className='text-lg font-semibold text-white mb-0.5'>{current.title}</h2>
                <p className='text-sm text-gray-400 mb-3'>{current.subtitle}</p>
                <p className='text-sm text-gray-300'>{current.content}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className='flex items-center justify-between'>
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className='text-sm text-gray-500 hover:text-gray-300 disabled:opacity-0 transition-colors'
            >
              Back
            </button>
            <div className='flex gap-3'>
              {current.action && (
                <button onClick={handleAction} className='btn-secondary flex items-center gap-2 text-sm'>
                  {current.action.label}
                  <ArrowRight className='w-3.5 h-3.5' />
                </button>
              )}
              {isLast ? (
                <button onClick={handleFinish} className='btn-primary flex items-center gap-2 text-sm'>
                  <CheckCircle className='w-4 h-4' />
                  Finish Setup
                </button>
              ) : (
                <button onClick={() => setStep((s) => s + 1)} className='btn-primary flex items-center gap-2 text-sm'>
                  Next
                  <ArrowRight className='w-3.5 h-3.5' />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OnboardingWizard
