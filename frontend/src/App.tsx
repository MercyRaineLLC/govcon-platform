import { Routes, Route } from "react-router-dom"

import DashboardPage from "./pages/Dashboard"
import { OpportunitiesPage } from "./pages/Opportunities"
import OpportunityDetail from "./pages/OpportunityDetail"
import { LoginPage } from "./pages/Login"
import { ClientsPage } from "./pages/Clients"
import { SubmissionsPage } from "./pages/Submissions"
import { PenaltiesPage } from "./pages/Penalties"
import { SettingsPage } from "./pages/Settings"
import { DocRequirementsPage } from "./pages/DocRequirements"
import { Layout } from "./components/layout"
import ClientPortalLogin from "./pages/ClientPortalLogin"
import ClientPortalDashboard from "./pages/ClientPortalDashboard"

export default function App() {
  return (
    <Routes>
      {/* Consultant auth */}
      <Route path="/login" element={<LoginPage />} />

      {/* Client portal (standalone, no consultant layout) */}
      <Route path="/client-login" element={<ClientPortalLogin />} />
      <Route path="/client-portal" element={<ClientPortalDashboard />} />

      {/* Consultant platform */}
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/opportunities/:id" element={<OpportunityDetail />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/doc-requirements" element={<DocRequirementsPage />} />
        <Route path="/submissions" element={<SubmissionsPage />} />
        <Route path="/penalties" element={<PenaltiesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}