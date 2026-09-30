import type {
  ApiResponse,
  AuthTokens,
  BusinessProfile,
  Roadmap,
  RoadmapStep,
  WhyResponse,
  Requirement,
  PaginatedResponse,
  Standard,
  Lab,
  Application,
  PrefillData,
  Feedback,
  Conversation,
  AdminMetrics,
  SourceDocument,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function ensureAccessToken(): Promise<string | null> {
  if (accessToken) return accessToken;
  return refreshAccessToken();
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Refresh failed');
      }

      const data: ApiResponse<AuthTokens> = await response.json();
      if (data.success && data.data?.accessToken) {
        accessToken = data.data.accessToken;
        return accessToken;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    } else {
      clearAuth();
      window.location.href = '/login';
      return { success: false, error: { code: 'UNAUTHORIZED', message: 'Session expired' } };
    }
  }

  const data = await response.json().catch(() => ({ success: false, error: { code: 'PARSE_ERROR', message: 'Invalid response' } }));
  return data;
}

export function clearAuth() {
  accessToken = null;
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body: unknown) => request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) => request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

export const authApi = {
  register: (email: string, password: string, name: string) =>
    api.post<AuthTokens>('/auth/register', { email, password, name }),
  login: (email: string, password: string) =>
    api.post<AuthTokens>('/auth/login', { email, password }),
  logout: () => api.post<void>('/auth/logout', {}),
  refresh: () => api.post<AuthTokens>('/auth/refresh', {}),
};

export const chatApi = {
  sendMessage: (conversationId: string | null, message: string, language: string, mode: 'general' | 'consumer') =>
    api.post<{ conversationId: string; messageId: string }>('/chat/message', { conversationId, message, language, mode }),
  getConversations: () => api.get<{ conversations: Conversation[] }>('/conversations'),
  getConversation: (id: string) =>
    api.get<{
      conversation: {
        id: string;
        messages?: Array<{
          id: string;
          conversationId?: string;
          role: string;
          content: string;
          intent?: string;
          createdAt: string;
        }>;
      };
    }>(`/conversations/${id}`),
};

export const businessApi = {
  create: (data: Partial<BusinessProfile>) => api.post<BusinessProfile>('/businesses', data),
  get: (id: string) => api.get<BusinessProfile>(`/businesses/${id}`),
  update: (id: string, data: Partial<BusinessProfile>) => api.patch<BusinessProfile>(`/businesses/${id}`, data),
  delete: (id: string) => api.delete<void>(`/businesses/${id}`),
  list: () => api.get<{ items: BusinessProfile[] }>('/businesses'),
  confirmProfile: (id: string) => api.post<void>(`/businesses/${id}/confirm-profile`, {}),
  addProduct: (businessId: string, data: { name: string; description?: string; material?: string }) =>
    api.post<{ id: string }>(`/businesses/${businessId}/products`, data),
  getProducts: (businessId: string) => api.get<{ items: Array<{ id: string; name: string; description?: string; material?: string }> }>(`/businesses/${businessId}/products`),
};

export const roadmapApi = {
  generate: (businessId: string) => api.post<Roadmap>(`/businesses/${businessId}/roadmap`, {}),
  get: (businessId: string) => api.get<Roadmap>(`/businesses/${businessId}/roadmap`),
  updateStep: (roadmapId: string, stepId: string, status: RoadmapStep['status']) =>
    api.patch<RoadmapStep>(`/roadmap/${roadmapId}/steps/${stepId}`, { status }),
  getWhy: (stepId: string) => api.get<WhyResponse>(`/roadmap/steps/${stepId}/why`),
};

export const requirementApi = {
  get: (id: string) => api.get<Requirement>(`/requirements/${id}`),
};

export const standardApi = {
  search: (params: { q?: string; category?: string; status?: string; page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.set(key, String(value));
    });
    return api.get<PaginatedResponse<Standard>>(`/standards/search?${searchParams.toString()}`);
  },
  recommend: (description: string, language: string) => api.post<Standard[]>('/standards/recommend', { description, language }),
  get: (id: string) => api.get<Standard>(`/standards/${id}`),
  analyzeCertification: (data: { productName: string; material?: string; location?: string; businessType?: string }) =>
    api.post<{ standards: Standard[]; analysis: string }>('/certification/analyze', data),
};

export const labApi = {
  list: (params: { state?: string; city?: string; capability?: string; product?: string; page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.set(key, String(value));
    });
    return api.get<PaginatedResponse<Lab>>(`/laboratories?${searchParams.toString()}`);
  },
};

export const applicationApi = {
  list: (businessId: string) => api.get<{ items: Application[] }>(`/businesses/${businessId}/applications`),
  create: (businessId: string, data: { requirementId: string; referenceNumber?: string; submittedDate?: string; reminderDate?: string; notes?: string }) =>
    api.post<Application>(`/businesses/${businessId}/applications`, data),
  update: (id: string, data: Partial<Application>) => api.patch<Application>(`/applications/${id}`, data),
  getPrefill: (id: string) => api.get<PrefillData>(`/applications/${id}/prefill`),
};

export const feedbackApi = {
  submit: (conversationId: string, messageId: string, rating: 'up' | 'down', reason?: string) =>
    api.post<Feedback>('/feedback', { conversationId, messageId, rating, reason }),
};

export const adminApi = {
  getMetrics: () => api.get<AdminMetrics>('/admin/metrics'),
  getSources: () => api.get<{ items: SourceDocument[] }>('/admin/sources'),
  ingestSource: (data: { title: string; type: string; url: string }) => api.post<void>('/admin/ingest', data),
};