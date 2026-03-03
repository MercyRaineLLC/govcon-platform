import { Routes, Route } from "react-router-dom"

import DashboardPage from "./pages/Dashboard"
import { OpportunitiesPage } from "./pages/Opportunities"
import OpportunityDetail from "./pages/OpportunityDetail"
import { LoginPage } from "./pages/Login"
import { ClientsPage } from "./pages/Clients"
import { SubmissionsPage } from "./pages/Submissions"
import { PenaltiesPage } from "./pages/Penalties"
import { SettingsPage } from "./pages/Settings"
import { Layout } from "./components/Layout"

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/opportunities/:id" element={<OpportunityDetail />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/submissions" element={<SubmissionsPage />} />
        <Route path="/penalties" element={<PenaltiesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}