import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // React error boundaries can't use hooks; log to a non-interactive channel.
    // In production this surfaces in the browser's performance/error panel only.
    // Backend audit trail is maintained via ComplianceLog for all state mutations.
    if (typeof window !== 'undefined' && (window as any).__govcon_logError) {
      (window as any).__govcon_logError(error.message, info.componentStack)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-6"
          style={{ background: '#040d1a' }}>
          <div className="text-center max-w-md">
            <p className="text-4xl font-bold text-amber-400 mb-2">Something went wrong</p>
            <p className="text-slate-400 text-sm mb-6">{this.state.message}</p>
            <button
              onClick={() => { this.setState({ hasError: false, message: '' }); window.location.href = '/' }}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-black"
              style={{ background: 'linear-gradient(90deg,#fbbf24,#f59e0b)' }}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
