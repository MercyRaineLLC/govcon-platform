import { Routes, Route } from "react-router-dom"

import DashboardPage from "./pages/Dashboard"
import { OpportunitiesPage } from "./pages/Opportunities"
import OpportunityDetail from "./pages/OpportunityDetail"
import { LoginPage } from "./pages/Login"
import { RegisterPage } from "./pages/Register"
import { ClientsPage } from "./pages/Clients"
import { SubmissionsPage } from "./pages/Submissions"
import { PenaltiesPage } from "./pages/Penalties"
import { SettingsPage } from "./pages/Settings"
import { DocRequirementsPage } from "./pages/DocRequirements"
import { TemplatesPage } from "./pages/Templates"
import AnalyticsPage from "./pages/Analytics"
import DecisionsPage from "./pages/Decisions"
import ComplianceLogsPage from "./pages/ComplianceLogs"
import { Layout } from "./components/layout"
import { ProtectedRoute } from "./components/ProtectedRoute"
import ClientPortalLogin from "./pages/ClientPortalLogin"
import ClientPortalDashboard from "./pages/ClientPortalDashboard"
import ClientDetail from "./pages/ClientDetail"
import TemplateLibrary from "./pages/TemplateLibrary"

export default function App() {
  return (
    <Routes>
      {/* Consultant auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Client portal (standalone, no consultant layout) */}
      <Route path="/client-login" element={<ClientPortalLogin />} />
      <Route path="/client-portal" element={<ClientPortalDashboard />} />

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

          <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
            <Route path="/compliance" element={<ComplianceLogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
