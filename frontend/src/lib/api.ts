/**
 * Central API client for BIS Sahayak
 *
 * In development  → requests go to /api/v1  (Vite proxy → localhost:3000)
 * In production   → set VITE_API_URL=http://<ec2-ip>:3000 in your .env
 */

const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

// ── Generic fetch wrapper ─────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',          // send/receive HttpOnly cookies (JWT)
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── Convenience helpers ───────────────────────────────────────────────────────

export const api = {
  get:    <T>(path: string) =>
    request<T>(path, { method: 'GET' }),

  post:   <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  put:    <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),

  patch:  <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),

  logout: () =>
    api.post('/auth/logout', {}),

  me: () =>
    api.get('/auth/me'),

  refreshToken: () =>
    api.post('/auth/refresh', {}),
};

// ── Businesses ────────────────────────────────────────────────────────────────

export const businessApi = {
  list:   ()            => api.get('/businesses'),
  get:    (id: string)  => api.get(`/businesses/${id}`),
  create: (data: unknown) => api.post('/businesses', data),
  update: (id: string, data: unknown) => api.patch(`/businesses/${id}`, data),
  delete: (id: string)  => api.delete(`/businesses/${id}`),
};

// ── Products ──────────────────────────────────────────────────────────────────

export const productApi = {
  list:   (businessId: string) =>
    api.get(`/businesses/${businessId}/products`),
  create: (businessId: string, data: unknown) =>
    api.post(`/businesses/${businessId}/products`, data),
  update: (businessId: string, productId: string, data: unknown) =>
    api.patch(`/businesses/${businessId}/products/${productId}`, data),
  delete: (businessId: string, productId: string) =>
    api.delete(`/businesses/${businessId}/products/${productId}`),
};

// ── Chat ──────────────────────────────────────────────────────────────────────

export const chatApi = {
  sendMessage: (data: { message: string; sessionId?: string }) =>
    api.post('/chat', data),
  getConversations: () =>
    api.get('/conversations'),
  getConversation:  (id: string) =>
    api.get(`/conversations/${id}`),
};

// ── Standards ─────────────────────────────────────────────────────────────────

export const standardsApi = {
  search: (query: string) =>
    api.get(`/standards?q=${encodeURIComponent(query)}`),
};

// ── Roadmap ───────────────────────────────────────────────────────────────────

export const roadmapApi = {
  generate: (businessId: string) =>
    api.post(`/businesses/${businessId}/roadmap`, {}),
  get: (businessId: string) =>
    api.get(`/businesses/${businessId}/roadmap`),
};
