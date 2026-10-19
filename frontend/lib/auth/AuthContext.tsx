'use client'
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { User } from '@/lib/types'

import { API_BASE } from '@/lib/api'

export { API_BASE }
const E2E_SKIP_AUTH = process.env.NEXT_PUBLIC_E2E_SKIP_AUTH === '1'

const E2E_ADMIN_USER: User = {
  id: 'e2e-admin',
  email: 'admin@example.com',
  full_name: 'E2E Admin',
  phone: '',
  profile_photo: '',
  role: 'admin',
  created_at: new Date(0).toISOString(),
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AuthContextType {
  user: User | null
  accessToken: string | null
  loading: boolean
  login: (identifier: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string, phone?: string) => Promise<void>
  googleLoginCallback: (code: string) => Promise<User>
  logout: () => Promise<void>
  /** Use instead of raw fetch() for any protected API call.
   *  Automatically injects the Authorization header and retries once on 401. */
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
  /** Re-read the signed-in user from the API (e.g. after their role changed). */
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse the `exp` claim from a JWT without a library. */
function parseJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

const TOKEN_KEY = 'conceptstay_token'
const USER_KEY = 'conceptstay_user'
const LEGACY_TOKEN_KEY = 'conceptstay_legacy_token'
const LEGACY_USER_KEY = 'conceptstay_legacy_user'

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY)
  } catch { return null }
}

function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function setStoredSession(token: string | null, u: User | null) {
  if (typeof window === 'undefined') return
  try {
    if (token && u) {
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(USER_KEY, JSON.stringify(u))
      localStorage.removeItem(LEGACY_TOKEN_KEY)
      localStorage.removeItem(LEGACY_USER_KEY)
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(LEGACY_TOKEN_KEY)
      localStorage.removeItem(LEGACY_USER_KEY)
    }
  } catch {}
}

const REFRESH_MARGIN_MS = 2 * 60 * 1000 // start refresh 2 min before expiry

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (E2E_SKIP_AUTH) return E2E_ADMIN_USER
    const u = getStoredUser()
    const t = getStoredToken()
    if (u && t) {
      const exp = parseJwtExp(t)
      if (exp && exp > Date.now()) return u
    }
    return null
  })

  const [accessToken, setAccessToken] = useState<string | null>(() => {
    if (E2E_SKIP_AUTH) return 'e2e-admin-token'
    const t = getStoredToken()
    if (t) {
      const exp = parseJwtExp(t)
      if (exp && exp > Date.now()) return t
    }
    return null
  })

  const [loading, setLoading] = useState(!E2E_SKIP_AUTH)

  // Ref so scheduleRefresh can call silentRefresh without a circular dep
  const silentRefreshRef = useRef<(() => Promise<string | null>) | undefined>(undefined)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }

  const saveSession = useCallback((token: string | null, u: User | null) => {
    setAccessToken(token)
    setUser(u)
    setStoredSession(token, u)
  }, [])

  /** Schedule an automatic silent refresh before the access token expires. */
  const scheduleRefresh = useCallback((token: string) => {
    clearRefreshTimer()
    const exp = parseJwtExp(token)
    if (!exp) return
    const delay = exp - Date.now() - REFRESH_MARGIN_MS
    if (delay <= 0) return // already too close — will refresh on next 401
    refreshTimerRef.current = setTimeout(async () => {
      await silentRefreshRef.current?.()
    }, delay)
  }, [])

  /** Call POST /auth/refresh which reads the httpOnly cookie and returns a new access token. */
  const silentRefresh = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // sends the httpOnly cookie
      })
      if (!res.ok) {
        const storedToken = getStoredToken()
        const exp = storedToken ? parseJwtExp(storedToken) : null
        if (exp && exp > Date.now()) {
          return storedToken
        }
        saveSession(null, null)
        clearRefreshTimer()
        return null
      }
      const data = await res.json()
      saveSession(data.access_token, data.user)
      scheduleRefresh(data.access_token)
      return data.access_token
    } catch {
      const storedToken = getStoredToken()
      const exp = storedToken ? parseJwtExp(storedToken) : null
      if (exp && exp > Date.now()) {
        return storedToken
      }
      return null
    }
  }, [saveSession, scheduleRefresh])

  // Keep the ref in sync so scheduleRefresh always calls the latest version
  useEffect(() => {
    silentRefreshRef.current = silentRefresh
  }, [silentRefresh])

  // On first mount: restore session.
  // If localStorage already has a valid non-expired token, use it directly
  // without hitting the network (avoids double-login after Google OAuth).
  // Only call silentRefresh when there is no usable local token.
  useEffect(() => {
    if (E2E_SKIP_AUTH) {
      setLoading(false)
      return
    }

    let isMounted = true

    const storedToken = getStoredToken()
    const storedUser = getStoredUser()
    const exp = storedToken ? parseJwtExp(storedToken) : null

    if (storedToken && storedUser && exp && exp > Date.now()) {
      // Valid token already in localStorage — no need to call /auth/refresh
      setLoading(false)
      scheduleRefresh(storedToken)
    } else {
      // No valid local token — try to get a new one from the refresh cookie
      silentRefresh().finally(() => {
        if (isMounted) setLoading(false)
      })
    }

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auth actions ─────────────────────────────────────────────────────────────

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
      credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Login failed')
    }
    const data = await res.json()
    saveSession(data.access_token, data.user)
    scheduleRefresh(data.access_token)
  }, [saveSession, scheduleRefresh])

  const register = useCallback(async (
    email: string,
    password: string,
    fullName: string,
    phone?: string,
  ) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName, phone }),
      credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Registration failed')
    }
    const data = await res.json()
    saveSession(data.access_token, data.user)
    scheduleRefresh(data.access_token)
  }, [saveSession, scheduleRefresh])

  const googleLoginCallback = useCallback(async (code: string): Promise<User> => {
    const res = await fetch(`${API_BASE}/auth/google/callback?code=${encodeURIComponent(code)}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Google authentication failed')
    }
    const data = await res.json()
    saveSession(data.access_token, data.user)
    scheduleRefresh(data.access_token)
    return data.user
  }, [saveSession, scheduleRefresh])

  const logout = useCallback(async () => {
    if (E2E_SKIP_AUTH) {
      saveSession(null, null)
      return
    }

    clearRefreshTimer()
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
    saveSession(null, null)
  }, [saveSession])

  // ── fetchWithAuth ─────────────────────────────────────────────────────────────

  /**
   * Drop-in replacement for fetch() on protected endpoints.
   * - Injects Authorization header automatically
   * - On 401: silently refreshes and retries once
   * - On second 401: logs out
   */
  const fetchWithAuth = useCallback(async (
    url: string,
    options: RequestInit = {},
  ): Promise<Response> => {
    let token = accessToken || getStoredToken()

    const makeRequest = (t: string | null) =>
      (() => {
        const headers = new Headers(options.headers)
        if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json')
        }
        if (t) {
          headers.set('Authorization', `Bearer ${t}`)
        } else {
          headers.delete('Authorization')
        }

        const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`

        return fetch(fullUrl, {
          ...options,
          credentials: 'include',
          headers,
        })
      })()

    let res = await makeRequest(token)

    if (res.status === 401) {
      // Token may have just expired — try refreshing once
      token = await silentRefresh()
      if (token) {
        res = await makeRequest(token)
      } else {
        // Refresh failed — session is dead
        saveSession(null, null)
      }
    }

    return res
  }, [accessToken, silentRefresh, saveSession])

  const refreshUser = useCallback(async () => {
    const res = await fetchWithAuth('/auth/me')
    if (!res.ok) return
    const fresh = (await res.json()) as User
    setUser(fresh)
    try { localStorage.setItem(USER_KEY, JSON.stringify(fresh)) } catch { /* storage unavailable */ }
  }, [fetchWithAuth])

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, register, googleLoginCallback, logout, fetchWithAuth, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
