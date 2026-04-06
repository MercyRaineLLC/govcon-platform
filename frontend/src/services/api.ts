import axios from 'axios';

const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000, // 30s – prevents indefinitely hanging requests
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('govcon_auth');
    if (stored) {
      const auth = JSON.parse(stored);
      if (auth.token) {
        config.headers.Authorization = `Bearer ${auth.token}`;
      }
    }
  } catch {}
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('govcon_auth');
      window.location.href = '/welcome';
    }
    return Promise.reject(err);
  }
);

// ---- Auth ----
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  registerFirm: (data: any) =>
    api.post('/auth/register-firm', data).then((r) => r.data),
  profile: () => api.get('/auth/profile').then((r) => r.data),
  betaStatus: () =>
    api.get('/auth/beta-status').then((r) => r.data),
};

// ---- Opportunities ----
export const opportunitiesApi = {
  search: (params?: any) =>
    api.get('/opportunities', { params }).then((r) => r.data),
  getById: (id: string) =>
    api.get(`/opportunities/${id}`).then((r) => r.data),
  ingest: (params: any) =>
    api.post('/opportunities/ingest', params).then((r) => r.data),
  score: (id: string, clientCompanyId: string) =>
    api.post(`/opportunities/${id}/score`, { clientCompanyId }).then((r) => r.data),
};

// ---- Jobs ----
export const jobsApi = {
  triggerIngest: (params?: { naicsCode?: string; agency?: string; limit?: number }) =>
    api.post('/jobs/ingest', params || {}).then((r) => r.data),
  triggerEnrich: () =>
    api.post('/jobs/enrich', {}).then((r) => r.data),
  triggerDocumentAnalysis: (documentId: string) =>
    api.post(`/jobs/analyze/${documentId}`).then((r) => r.data),
  getJob: (id: string) =>
    api.get(`/jobs/${id}`).then((r) => r.data),
  listJobs: () =>
    api.get('/jobs').then((r) => r.data),
};

// ---- Documents ----
export const documentsApi = {
  upload: (opportunityId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('opportunityId', opportunityId);
    return api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  uploadZip: (opportunityId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('opportunityId', opportunityId);
    return api.post('/documents/upload-zip', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  list: (opportunityId: string) =>
    api.get(`/documents/${opportunityId}`).then((r) => r.data),
  delete: (documentId: string) =>
    api.delete(`/documents/${documentId}`).then((r) => r.data),
};

// ---- Clients ----
export const clientsApi = {
  list: (params?: any) =>
    api.get('/clients', { params }).then((r) => r.data),
  getById: (id: string) =>
    api.get(`/clients/${id}`).then((r) => r.data),
  create: (data: any) =>
    api.post('/clients', data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/clients/${id}`, data).then((r) => r.data),
  deactivate: (id: string) =>
    api.delete(`/clients/${id}`).then((r) => r.data),
  stats: (id: string) =>
    api.get(`/clients/${id}/stats`).then((r) => r.data),
  /** Look up entity data from SAM.gov without creating a client record */
  samLookup: (params: { uei?: string; cage?: string; name?: string }) =>
    api.get('/clients/lookup', { params }).then((r) => r.data),
  /** Bulk import clients from a CSV file */
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/clients/import-csv', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }).then((r) => r.data);
  },
};

// ---- Submissions ----
export const submissionsApi = {
  list: (params?: any) =>
    api.get('/submissions', { params }).then((r) => r.data),
  create: (data: any) =>
    api.post('/submissions', data).then((r) => r.data),
  getById: (id: string) =>
    api.get(`/submissions/${id}`).then((r) => r.data),
};

// ---- Penalties ----
export const penaltiesApi = {
  list: (params?: any) =>
    api.get('/penalties', { params }).then((r) => r.data),
  summary: () =>
    api.get('/penalties/summary').then((r) => r.data),
  getById: (id: string) =>
    api.get(`/penalties/${id}`).then((r) => r.data),
  markPaid: (id: string) =>
    api.put(`/penalties/${id}/pay`).then((r) => r.data),
};

// ---- Firm ----
export const firmApi = {
  get: () =>
    api.get('/firm').then((r) => r.data),
  dashboard: () =>
    api.get('/firm/dashboard').then((r) => r.data),
  metrics: () =>
    api.get('/firm/metrics').then((r) => r.data),
  updatePenaltyConfig: (data: any) =>
    api.put('/firm/penalty-config', data).then((r) => r.data),
  users: () =>
    api.get('/firm/users').then((r) => r.data),
  seedDemo: () =>
    api.post('/firm/seed-demo').then((r) => r.data),
  updateSamApiKey: (samApiKey: string) =>
    api.put('/firm/sam-api-key', { samApiKey }).then((r) => r.data),
  updateAnthropicApiKey: (anthropicApiKey: string) =>
    api.put('/firm/anthropic-api-key', { anthropicApiKey }).then((r) => r.data),
  updateLlmProvider: (llmProvider: string) =>
    api.put('/firm/llm-provider', { llmProvider }).then((r) => r.data),
  updateOpenaiApiKey: (openaiApiKey: string) =>
    api.put('/firm/openai-api-key', { openaiApiKey }).then((r) => r.data),
  updateInsightEngineApiKey: (insightEngineApiKey: string) =>
    api.put('/firm/insight-engine-api-key', { insightEngineApiKey }).then((r) => r.data),
  updateLocalaiConfig: (data: { localaiBaseUrl?: string; localaiModel?: string }) =>
    api.put('/firm/localai-config', data).then((r) => r.data),
  aiUsage: (params?: { days?: number }) =>
    api.get('/firm/ai-usage', { params }).then((r) => r.data),
  updateVeteranStatus: (isVeteranOwned: boolean) =>
    api.put('/firm/veteran-status', { isVeteranOwned }).then((r) => r.data),
};

// ---- Analytics ----
export const analyticsApi = {
  trends: (params?: { months?: number }) =>
    api.get('/analytics/trends', { params }).then((r) => r.data),
  pipeline: () =>
    api.get('/analytics/pipeline').then((r) => r.data),
  marketIntelligence: () =>
    api.get('/analytics/market-intelligence').then((r) => r.data),
  predictions: () =>
    api.get('/analytics/predictions').then((r) => r.data),
  portfolioHealth: () =>
    api.get('/analytics/portfolio-health').then((r) => r.data),
  complianceLogs: (params?: { entityType?: string; entityId?: string; page?: number; limit?: number }) =>
    api.get('/analytics/compliance-logs', { params }).then((r) => r.data),
  pipelineAnalysis: () =>
    api.get('/analytics/pipeline-analysis').then((r) => r.data),
};

// ---- Decisions ----
export const decisionsApi = {
  list: (params?: any) =>
    api.get('/decision', { params }).then((r) => r.data),
  run: (opportunityId: string, clientCompanyId: string) =>
    api.post('/decision/run', { opportunityId, clientCompanyId }).then((r) => r.data),
  metrics: () =>
    api.get('/decision/metrics').then((r) => r.data),
};

// ---- Doc Requirements ----
export const docRequirementsApi = {
  list: (params?: any) =>
    api.get('/doc-requirements', { params }).then((r) => r.data),
  create: (data: any) =>
    api.post('/doc-requirements', data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/doc-requirements/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/doc-requirements/${id}`).then((r) => r.data),
  forClient: (clientId: string) =>
    api.get(`/doc-requirements/client/${clientId}`).then((r) => r.data),
};

// ---- Templates ----
export const templatesApi = {
  list: (params?: any) =>
    api.get('/templates', { params }).then((r) => r.data),
  upload: (formData: FormData) =>
    api.post('/templates', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
  update: (id: string, data: any) =>
    api.patch(`/templates/${id}`, data).then((r) => r.data),
  deactivate: (id: string) =>
    api.delete(`/templates/${id}`).then((r) => r.data),
  assign: (id: string, data: any) =>
    api.post(`/templates/${id}/assign`, data).then((r) => r.data),
  download: async (id: string) => {
    const response = await api.get(`/templates/${id}/download`, { responseType: 'blob' });
    return response.data as Blob;
  },
};

// ---- Rewards ----
export const rewardsApi = {
  list: (params?: any) =>
    api.get('/rewards', { params }).then((r) => r.data),
  create: (data: any) =>
    api.post('/rewards', data).then((r) => r.data),
  evaluate: (clientCompanyId: string) =>
    api.post(`/rewards/evaluate/${clientCompanyId}`).then((r) => r.data),
  redeem: (id: string) =>
    api.put(`/rewards/${id}/redeem`).then((r) => r.data),
};

// ---- Score / Amendment ----
export const scoreApi = {
  getBreakdown: (opportunityId: string) =>
    api.get(`/opportunities/${opportunityId}/score-breakdown`).then((r) => r.data),
  interpretAmendment: (opportunityId: string, amendmentId: string) =>
    api.post(`/opportunities/${opportunityId}/amendments/${amendmentId}/interpret`).then((r) => r.data),
};

// ---- Clients — decline/un-decline per client ----
export const clientOpportunitiesApi = {
  getMatched: (clientId: string) =>
    api.get(`/clients/${clientId}/opportunities`).then((r) => r.data),
  decline: (clientId: string, opportunityId: string, reason?: string) =>
    api.post(`/clients/${clientId}/decline-opportunity`, { opportunityId, reason }).then((r) => r.data),
  undecline: (clientId: string, opportunityId: string) =>
    api.delete(`/clients/${clientId}/decline-opportunity/${opportunityId}`).then((r) => r.data),
};

// ---- Client Portal Users (created by consultants) ----
export const clientPortalUsersApi = {
  register: (data: { clientCompanyId: string; email: string; password: string; firstName: string; lastName: string }) =>
    api.post('/client-portal/auth/register', data).then((r) => r.data),
  /** List all portal users for a client */
  listByClient: (clientId: string) =>
    api.get(`/client-portal/admin/users/${clientId}`).then((r) => r.data),
  /** Reset a portal user's password */
  resetPassword: (userId: string, newPassword: string) =>
    api.put(`/client-portal/admin/users/${userId}/reset-password`, { newPassword }).then((r) => r.data),
  /** Toggle a portal user's active status */
  toggleActive: (userId: string) =>
    api.put(`/client-portal/admin/users/${userId}/toggle-active`).then((r) => r.data),
};

// ---- Client Portal (used from portal frontend with portal token) ----
const API_BASE_RAW = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const clientPortalApi = {
  _getToken: () => { try { const raw = localStorage.getItem('govcon_client_auth'); return raw ? (JSON.parse(raw).token ?? '') : '' } catch { return '' } },
  getOpportunities: () =>
    axios.get(`${API_BASE_RAW}/api/client-portal/opportunities`, { headers: { Authorization: `Bearer ${clientPortalApi._getToken()}` } }).then(r => r.data),
  uploadDoc: (file: File, title: string, notes?: string) => {
    const fd = new FormData(); fd.append('file', file); fd.append('title', title); if (notes) fd.append('notes', notes);
    return axios.post(`${API_BASE_RAW}/api/client-portal/uploads`, fd, { headers: { Authorization: `Bearer ${clientPortalApi._getToken()}`, 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  getUploads: () =>
    axios.get(`${API_BASE_RAW}/api/client-portal/uploads`, { headers: { Authorization: `Bearer ${clientPortalApi._getToken()}` } }).then(r => r.data),
  adminGetUploads: (clientId: string) =>
    api.get(`/client-portal/admin/uploads/${clientId}`).then(r => r.data),
  adminDownloadUpload: async (clientId: string, uploadId: string, fileName: string) => {
    const res = await api.get(`/client-portal/admin/uploads/${clientId}/download/${uploadId}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
  },
};

// ---- Client Documents & Template Library ----
export const clientDocumentsApi = {
  upload: (data: { clientCompanyId: string; documentType: string; title: string; notes?: string }, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined) fd.append(k, v) })
    return api.post('/client-documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },
  list: (clientCompanyId: string) =>
    api.get('/client-documents', { params: { clientCompanyId } }).then((r) => r.data),
  download: async (documentId: string, fileName: string) => {
    const res = await api.get(`/client-documents/${documentId}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click()
    URL.revokeObjectURL(url)
  },
  delete: (documentId: string) =>
    api.delete('/client-documents/' + documentId).then((r) => r.data),
  shareAsTemplate: (documentId: string, data: { title: string; description?: string }) =>
    api.post('/client-documents/' + documentId + '/share-as-template', data).then((r) => r.data),
  listTemplates: (params?: { documentType?: string; page?: number; limit?: number }) =>
    api.get('/client-documents/templates', { params }).then((r) => r.data),
  downloadTemplate: async (templateId: string, fileName: string) => {
    const res = await api.get('/client-documents/templates/download/' + templateId, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click()
    URL.revokeObjectURL(url)
  },
  listTemplatesAdmin: () =>
    api.get('/client-documents/templates/admin').then((r) => r.data),
  reviewTemplate: (templateId: string, data: { status: 'APPROVED' | 'REJECTED'; reviewNotes?: string }) =>
    api.post('/client-documents/templates/' + templateId + '/review', data).then((r) => r.data),
}

// ---- Billing ----
export const billingApi = {
  getPlans: () => api.get('/billing/plans').then((r) => r.data),
  getSubscription: () => api.get('/billing/subscription').then((r) => r.data),
  subscribe: (planId: string, billingCycle: 'MONTHLY' | 'ANNUAL') =>
    api.post('/billing/subscribe', { planId, billingCycle }).then((r) => r.data),
  cancel: () => api.put('/billing/subscription/cancel').then((r) => r.data),
  reactivate: () => api.put('/billing/subscription/reactivate').then((r) => r.data),
  getInvoices: (params?: { page?: number; limit?: number }) =>
    api.get('/billing/invoices', { params }).then((r) => r.data),
  getInvoice: (id: string) => api.get(`/billing/invoices/${id}`).then((r) => r.data),
  generateInvoice: (notes?: string) =>
    api.post('/billing/invoices/generate', { notes }).then((r) => r.data),
  updateInvoiceStatus: (id: string, status: string) =>
    api.put(`/billing/invoices/${id}/status`, { status }).then((r) => r.data),
}

// ---- Add-ons ----
export const addonsApi = {
  list: () => api.get('/addons').then(r => r.data),
  purchase: (slug: string) => api.post(`/addons/${slug}/purchase`).then(r => r.data),
  cancel: (slug: string) => api.delete(`/addons/${slug}/cancel`).then(r => r.data),
}

export const proposalAssistApi = {
  generateOutline: (opportunityId: string) =>
    api.post(`/proposal-assist/${opportunityId}/outline`, {}, { timeout: 120000 }).then(r => r.data),
  generateQuestions: (opportunityId: string, outline: any) =>
    api.post(`/proposal-assist/${opportunityId}/questions`, { outline }, { timeout: 60000 }).then(r => r.data),
  generateDraftPdf: (opportunityId: string, answers: any[], userGuidance?: string, bidFormContext?: string) =>
    api.post(`/proposal-assist/${opportunityId}/draft`, { answers, userGuidance, bidFormContext }, { timeout: 180000, responseType: 'blob' }).then(r => r.data),
}

// ---- Compliance Matrix ----
export const complianceMatrixApi = {
  get: (opportunityId: string) =>
    api.get(`/compliance-matrix/${opportunityId}`).then((r) => r.data),
  generate: (opportunityId: string) =>
    api.post(`/compliance-matrix/${opportunityId}/generate`, {}, { timeout: 90000 }).then((r) => r.data),
  updateRequirement: (requirementId: string, data: { proposalSection?: string; status?: string; notes?: string }) =>
    api.patch(`/compliance-matrix/requirements/${requirementId}`, data).then((r) => r.data),
  generateBidGuidance: (opportunityId: string) =>
    api.post(`/compliance-matrix/${opportunityId}/bid-guidance`, {}, { timeout: 90000 }).then((r) => r.data),
}

// ---- Market Analytics (BigQuery-powered) ----
export const marketAnalyticsApi = {
  status: () =>
    api.get('/market-analytics/status').then((r) => r.data),
  competition: (naicsCode: string, agency?: string) =>
    api.get(`/market-analytics/competition/${naicsCode}`, { params: agency ? { agency } : {} }).then((r) => r.data),
  agency: (agencyName: string) =>
    api.get(`/market-analytics/agency/${encodeURIComponent(agencyName)}`).then((r) => r.data),
  contractor: (name: string) =>
    api.get(`/market-analytics/contractor/${encodeURIComponent(name)}`).then((r) => r.data),
  snapshot: (naics?: string) =>
    api.get('/market-analytics/snapshot', { params: naics ? { naics } : {} }).then((r) => r.data),
  ingest: (body: { naicsCode?: string; agency?: string; bulk?: boolean; maxPages?: number }) =>
    api.post('/market-analytics/ingest', body).then((r) => r.data),
}

// ---- State & Municipal ----
export const stateMunicipalApi = {
  list: (params?: { state?: string; level?: string; limit?: number; offset?: number; search?: string }) =>
    api.get('/state-municipal/opportunities', { params }).then((r) => r.data),
  stats: () => api.get('/state-municipal/stats').then((r) => r.data),
  sync: () => api.post('/state-municipal/sync').then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/state-municipal/opportunities', data).then((r) => r.data),
  delete: (id: string) => api.delete(`/state-municipal/opportunities/${id}`).then((r) => r.data),
  clearAll: () => api.delete('/state-municipal/all').then((r) => r.data),
  previewImport: (file: File, defaultState?: string) => {
    const fd = new FormData()
    fd.append('file', file)
    if (defaultState) fd.append('defaultState', defaultState)
    return api.post('/state-municipal/import?preview=true', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  bulkImport: (file: File, defaultState?: string) => {
    const fd = new FormData()
    fd.append('file', file)
    if (defaultState) fd.append('defaultState', defaultState)
    return api.post('/state-municipal/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
}

// ---- Subcontracting ----
export const subcontractingApi = {
  list: (params?: { search?: string; naicsCode?: string; limit?: number; offset?: number }) =>
    api.get('/subcontracting/opportunities', { params }).then((r) => r.data),
  stats: () => api.get('/subcontracting/stats').then((r) => r.data),
  sync: () => api.post('/subcontracting/sync').then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/subcontracting/opportunities', data).then((r) => r.data),
  delete: (id: string) => api.delete(`/subcontracting/opportunities/${id}`).then((r) => r.data),
}

// ---- Manual Contract Upload ----
export const contractsApi = {
  upload: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/contracts/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }).then((r) => r.data)
  },
  listManual: () =>
    api.get('/contracts/manual').then((r) => r.data),
}
