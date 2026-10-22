import axios from 'axios';

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
// Normalize baseURL to end with /api
const API_URL = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl.replace(/\/+$/, '')}/api`;

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

export async function fetchCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = axios
      .get(`${API_URL}/csrf-token`, { withCredentials: true })
      .then((res) => {
        csrfToken = res.data?.csrfToken || null;
        return csrfToken;
      })
      .catch(() => null)
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

api.interceptors.request.use(async (config) => {
  // If url accidentally starts with /api/, strip leading /api since baseURL already has it
  if (config.url && config.url.startsWith('/api/')) {
    config.url = config.url.replace(/^\/api/, '');
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Attach CSRF token for mutating requests
  const method = (config.method || 'get').toLowerCase();
  if (!['get', 'head', 'options'].includes(method)) {
    const csrf = await fetchCsrfToken();
    if (csrf) {
      config.headers['x-csrf-token'] = csrf;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If CSRF error occurred, invalidate cached token
    if (
      error.response?.status === 403 &&
      (error.response?.data?.error?.toLowerCase?.().includes('csrf') ||
        error.response?.data?.code === 'EBADCSRFTOKEN')
    ) {
      csrfToken = null;
    }

    if (error.response?.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  }
);