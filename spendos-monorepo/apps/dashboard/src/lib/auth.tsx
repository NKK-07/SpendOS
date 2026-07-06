"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type UserRole = 'PRINCIPAL' | 'ADMIN' | 'VIP' | 'MANAGER' | 'EMPLOYEE';

export interface AuthUser {
  userId: string;
  companyId: string;
  fullName: string;
  email: string;
  role: UserRole;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  refreshAuth: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => {},
  logout: () => {},
  isLoading: true,
  refreshAuth: async () => null,
});

export function useAuth() {
  return useContext(AuthContext);
}

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

let cachedCsrfToken = '';

async function getCsrfToken() {
  if (cachedCsrfToken) return cachedCsrfToken;
  try {
    const res = await fetch(`${API_BASE}/csrf`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      cachedCsrfToken = data.csrfToken;
      return cachedCsrfToken;
    }
    throw new Error(`CSRF fetch failed with status ${res.status}`);
  } catch (error) {
    throw new Error('Failed to fetch CSRF token: ' + (error as Error).message);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
        if (!res.ok) throw new Error('Unauthorized');
        const data = await res.json();
        const authUser: AuthUser = {
          userId: data.id,
          companyId: data.company_id,
          fullName: data.full_name,
          email: data.email,
          role: data.role as UserRole,
        };
        localStorage.setItem('spendos_auth_meta', JSON.stringify(authUser));
        setUser(authUser);
      } catch (err) {
        localStorage.removeItem('spendos_auth_meta');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const token = await getCsrfToken();
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'csrf-token': token },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    const authUser: AuthUser = {
      userId: data.user.id,
      companyId: data.user.company_id,
      fullName: data.user.full_name,
      email: data.user.email,
      role: data.user.role as UserRole,
    };
    localStorage.setItem('spendos_auth_meta', JSON.stringify(authUser));
    setUser(authUser);
  };

  const refreshAuth = useCallback(async (): Promise<string | null> => {
    const stored = localStorage.getItem('spendos_auth_meta');
    if (!stored) return null;
    const current: AuthUser = JSON.parse(stored);
    try {
      const token = await getCsrfToken();
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'csrf-token': token },
        credentials: 'include',
      });
      if (!res.ok) { logout(); return null; }
      const data = await res.json();
      const updated = { ...current };
      // Tokens are now in HttpOnly cookies set by backend automatically.
      localStorage.setItem('spendos_auth_meta', JSON.stringify(updated));
      setUser(updated);
      return "refreshed"; // Signal that refresh succeeded
    } catch {
      logout();
      return null;
    }
  }, []);

  const logout = async () => {
    try {
      const token = await getCsrfToken();
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'csrf-token': token },
        credentials: 'include',
      });
    } catch (e) {}
    localStorage.removeItem('spendos_auth_meta');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

// Role hierarchy helpers
export const ROLE_LABELS: Record<UserRole, string> = {
  PRINCIPAL: 'Principal',
  ADMIN: 'Admin',
  VIP: 'VIP',
  MANAGER: 'Manager',
  EMPLOYEE: 'User',
};

export function isReviewer(role: UserRole) {
  return ['PRINCIPAL', 'ADMIN', 'MANAGER'].includes(role);
}

export function isAdminUp(role: UserRole) {
  return ['PRINCIPAL', 'ADMIN'].includes(role);
}

// Authenticated fetch with auto-refresh and timeout
export async function authFetch(
  url: string,
  token: string, // Kept for backwards compatibility if needed, but not sent in header
  options: RequestInit = {},
  onRefresh?: () => Promise<string | null>
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  
  // Custom CSRF Header ensures CORS preflight on all requests
  const csrfToken = await getCsrfToken();
  headers.set('csrf-token', csrfToken);

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', crypto.randomUUID());
  }

  // Network Timeout Setup (15s)
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);
  
  // Include credentials for HttpOnly cookies
  const fetchOptions: RequestInit = { ...options, headers, signal: controller.signal, credentials: 'include' };

  try {
    let res = await fetch(url, fetchOptions);
    clearTimeout(id);

    // Auto-refresh on 401
    if (res.status === 401 && onRefresh) {
      const newToken = await onRefresh();
      if (newToken) {
        const retryController = new AbortController();
        const retryId = setTimeout(() => retryController.abort(), 15000);
        res = await fetch(url, { ...options, headers, signal: retryController.signal, credentials: 'include' });
        clearTimeout(retryId);
      }
    }
    return res;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Network request timed out. Please check your connection.');
    }
    throw error;
  }
}

// Convenience hook: returns a pre-bound authFetch
export function useApi() {
  const { user, refreshAuth } = useAuth();
  return useCallback(
    (path: string, options: RequestInit = {}) => {
      if (!user) throw new Error('Not authenticated');
      return authFetch(`${API_BASE}${path}`, "", options, refreshAuth);
    },
    [user, refreshAuth]
  );
}

