import axios from 'axios';

const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
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
      window.location.href = '/login';
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
};