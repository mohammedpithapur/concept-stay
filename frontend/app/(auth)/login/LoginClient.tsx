'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { API_BASE } from '@/lib/auth/AuthContext'

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'
  const resetSuccess = searchParams.get('reset') === 'success'
  const { login, user, loading } = useAuth()

  const [form, setForm] = useState({ identifier: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      const target = (user.role === 'admin' && (next === '/dashboard' || !next)) ? '/admin/properties' : next
      router.replace(target)
    }
  }, [user, loading, router, next])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.identifier.trim()) e.identifier = 'Email or phone number is required'
    if (!form.password) e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setApiError('')
    setSubmitting(true)
    try {
      await login(form.identifier, form.password)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/google/url?next=${encodeURIComponent(next)}`)
      if (!res.ok) {
        setApiError('Google login is not configured yet.')
        return
      }
      const { url } = await res.json()
      window.location.href = url
    } catch {
      setApiError('Failed to start Google login.')
    }
  }

  const inputStyle = (field: string) => ({
    width: '100%',
    padding: '14px 16px',
    border: `1px solid ${errors[field] ? '#E53E3E' : 'var(--color-border)'}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    outline: 'none',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box' as const,
  })

  const labelStyle = {
    fontSize: '11px',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    color: 'var(--color-text-muted)',
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600' as const,
  }

  if (loading) return null

  return (
    <div className="auth-shell" style={{ backgroundColor: 'var(--color-bg-soft)' }}>
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <h1 style={{ color: 'var(--color-text-primary)', fontSize: '28px', letterSpacing: '3px', marginBottom: '8px', fontWeight: '800' }}>
              Concept Stay
            </h1>
          </Link>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Welcome back</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: 'clamp(24px, 4vw, 40px)' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>Sign In</h2>
          <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', marginBottom: '28px' }} />

          {apiError && (
            <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#C53030', fontSize: '14px' }}>
              {apiError}
              {apiError.includes('No account found') && (
                <div style={{ marginTop: '10px' }}>
                  <Link
                    href={`/register?next=${encodeURIComponent(next)}`}
                    style={{ display: 'inline-block', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', textDecoration: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}
                  >
                    Register / Sign Up Now
                  </Link>
                </div>
              )}
            </div>
          )}

          {resetSuccess && !apiError && (
            <div style={{ backgroundColor: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#276749', fontSize: '14px' }}>
              Password updated. You can sign in with your new password.
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Email or Phone Number</label>
            <input
              type="text"
              id="login-identifier"
              placeholder="you@example.com or 9876543210"
              value={form.identifier}
              onChange={e => setForm({ ...form, identifier: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={inputStyle('identifier')}
            />
            {errors.identifier && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.identifier}</p>}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="login-password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                style={{ ...inputStyle('password'), paddingRight: '88px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', backgroundColor: 'transparent', color: 'var(--color-terra)', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', cursor: 'pointer', padding: '8px 10px' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.password}</p>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '28px' }}>
            <Link href="/forgot-password" style={{ color: 'var(--color-terra)', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
              Forgot password?
            </Link>
          </div>

          <button
            id="login-submit"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ width: '100%', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', border: 'none', padding: '16px', fontSize: '13px', letterSpacing: '2px', fontWeight: '700', textTransform: 'uppercase', cursor: submitting ? 'not-allowed' : 'pointer', marginBottom: '24px', borderRadius: '8px', opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? 'Signing In...' : 'Sign In'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>OR</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
          </div>

          <button
            id="login-google"
            onClick={handleGoogleLogin}
            style={{ width: '100%', backgroundColor: 'transparent', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '14px', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '24px', fontWeight: '600' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-terra)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)'}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px', lineHeight: '1.6' }}>
            By signing in you agree to our{' '}
            <Link href="/terms" style={{ color: 'var(--color-terra)', textDecoration: 'none', fontWeight: '600' }}>Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" style={{ color: 'var(--color-terra)', textDecoration: 'none', fontWeight: '600' }}>Privacy Policy</Link>
          </p>

          <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Don&apos;t have an account?{' '}
            <Link href={`/register?next=${encodeURIComponent(next)}`} style={{ color: 'var(--color-terra)', textDecoration: 'none', fontWeight: '700' }}>
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
