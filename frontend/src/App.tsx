import { lazy, Suspense } from "react"
import { Routes, Route } from "react-router-dom"
import { Spinner } from "./components/ui"
import { Layout } from "./components/layout"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { AiAssistant } from "./components/AiAssistant"

// Lazy-loaded pages — each chunk loads on demand, reducing initial bundle
const DashboardPage        = lazy(() => import("./pages/Dashboard"))
const OpportunitiesPage    = lazy(() => import("./pages/Opportunities").then(m => ({ default: m.OpportunitiesPage })))
const OpportunityDetail    = lazy(() => import("./pages/OpportunityDetail"))
const LoginPage            = lazy(() => import("./pages/Login").then(m => ({ default: m.LoginPage })))
const RegisterPage         = lazy(() => import("./pages/Register").then(m => ({ default: m.RegisterPage })))
const ClientsPage          = lazy(() => import("./pages/Clients").then(m => ({ default: m.ClientsPage })))
const ClientDetail         = lazy(() => import("./pages/ClientDetail"))
const SubmissionsPage      = lazy(() => import("./pages/Submissions").then(m => ({ default: m.SubmissionsPage })))
const PenaltiesPage        = lazy(() => import("./pages/Penalties").then(m => ({ default: m.PenaltiesPage })))
const SettingsPage         = lazy(() => import("./pages/Settings").then(m => ({ default: m.SettingsPage })))
const DocRequirementsPage  = lazy(() => import("./pages/DocRequirements").then(m => ({ default: m.DocRequirementsPage })))
const TemplatesPage        = lazy(() => import("./pages/Templates").then(m => ({ default: m.TemplatesPage })))
const TemplateLibrary      = lazy(() => import("./pages/TemplateLibrary"))
const AnalyticsPage        = lazy(() => import("./pages/Analytics"))
const DecisionsPage        = lazy(() => import("./pages/Decisions"))
const ComplianceLogsPage   = lazy(() => import("./pages/ComplianceLogs"))
const AdminBacktestPage    = lazy(() => import("./pages/AdminBacktest"))
const ClientPortalLogin    = lazy(() => import("./pages/ClientPortalLogin"))
const ClientPortalDashboard = lazy(() => import("./pages/ClientPortalDashboard"))
const RewardsPage          = lazy(() => import("./pages/Rewards").then(m => ({ default: m.RewardsPage })))
const BillingPage            = lazy(() => import("./pages/Billing"))
const StateMunicipalPage     = lazy(() => import("./pages/StateMunicipalPage").then(m => ({ default: m.StateMunicipalPage })))
const SubcontractingPage     = lazy(() => import("./pages/SubcontractingPage").then(m => ({ default: m.SubcontractingPage })))
const RoiCalculatorPage      = lazy(() => import("./pages/RoiCalculator"))
const ContractUploadPage     = lazy(() => import("./pages/ContractUpload"))
const ForgotPasswordPage      = lazy(() => import("./pages/ForgotPassword").then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage       = lazy(() => import("./pages/ResetPassword").then(m => ({ default: m.ResetPasswordPage })))
const LandingPage            = lazy(() => import("./pages/Landing").then(m => ({ default: m.LandingPage })))
const BetaAccessPage         = lazy(() => import("./pages/BetaAccess"))
const NotFoundPage           = lazy(() => import("./pages/NotFound"))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Spinner />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public pages */}
          <Route path="/welcome" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/beta-access" element={<BetaAccessPage />} />

          {/* Client portal (standalone, no consultant layout) */}
          <Route path="/client-login" element={<ClientPortalLogin />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/client-portal" element={<ClientPortalDashboard />} />
          </Route>

          {/* Consultant platform */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/opportunities" element={<OpportunitiesPage />} />
              <Route path="/opportunities/:id" element={<OpportunityDetail />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients/:id" element={<ClientDetail />} />
              <Route path="/template-library" element={<TemplateLibrary />} />
              <Route path="/decisions" element={<DecisionsPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/doc-requirements" element={<DocRequirementsPage />} />
              <Route path="/submissions" element={<SubmissionsPage />} />
              <Route path="/penalties" element={<PenaltiesPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/state-municipal" element={<StateMunicipalPage />} />
              <Route path="/subcontracting" element={<SubcontractingPage />} />
              <Route path="/rewards" element={<RewardsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/roi-calculator" element={<RoiCalculatorPage />} />
              <Route path="/contract-upload" element={<ContractUploadPage />} />

              <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
                <Route path="/compliance" element={<ComplianceLogsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/admin/backtest" element={<AdminBacktestPage />} />
              </Route>
            </Route>
          </Route>

          {/* 404 catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <AiAssistant />
      </Suspense>
    </ErrorBoundary>
  )
}
