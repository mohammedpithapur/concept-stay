'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { API_BASE } from '@/lib/auth/AuthContext'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [form, setForm] = useState({ password: '', confirm_password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!token) newErrors.token = 'This reset link is missing a token. Please request a new link.'
    if (!form.password) newErrors.password = 'Password is required'
    else if (form.password.length < 8) newErrors.password = 'Password must be at least 8 characters'
    if (!form.confirm_password) newErrors.confirm_password = 'Please confirm your password'
    else if (form.password !== form.confirm_password) newErrors.confirm_password = 'Passwords do not match'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setApiError('')
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, new_password: form.password }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || 'Unable to reset password')
      }
      setSuccess(true)
      setTimeout(() => router.push('/login?reset=success'), 1800)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unable to reset password')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (field: string) => ({
    width: '100%', padding: '14px 16px',
    border: `1px solid ${errors[field] ? '#E53E3E' : 'var(--color-border)'}`,
    borderRadius: '8px', fontSize: '14px', color: 'var(--color-text-primary)',
    outline: 'none', backgroundColor: '#ffffff',
    boxSizing: 'border-box' as const, fontFamily: 'inherit'
  })

  return (
    <div className="auth-shell" style={{ backgroundColor: 'var(--color-bg-soft)' }}>
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <h1 style={{ color: 'var(--color-text-primary)', fontSize: '28px', letterSpacing: '3px', marginBottom: '8px', fontWeight: '800' }}>
              CONCEPT STAY
            </h1>
          </Link>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Create a new password</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: 'clamp(24px, 4vw, 40px)' }}>
          {!success ? (
            <>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                Reset Password
              </h2>
              <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-terra)', marginBottom: '16px' }} />
              <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '28px', lineHeight: '1.6' }}>
                Choose a strong password that you haven&apos;t used before.
              </p>

              {(errors.token || apiError) && (
                <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#C53030', fontSize: '14px', lineHeight: '1.5' }}>
                  {errors.token || apiError}{' '}
                  <Link href="/forgot-password" style={{ color: '#9B2C2C', fontWeight: '700' }}>
                    Request a new link
                  </Link>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  New Password
                </label>
                <input
                  type="password"
                  placeholder="********"
                  value={form.password}
                  onChange={e => { setForm({ ...form, password: e.target.value }); setApiError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  style={inputStyle('password')}
                />
                {errors.password && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.password}</p>}
              </div>

              <div style={{ marginBottom: '28px' }}>
                <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  placeholder="********"
                  value={form.confirm_password}
                  onChange={e => { setForm({ ...form, confirm_password: e.target.value }); setApiError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  style={inputStyle('confirm_password')}
                />
                {errors.confirm_password && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{errors.confirm_password}</p>}
              </div>

              <div style={{ backgroundColor: 'var(--color-bg-soft)', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
                  Password must be at least 8 characters. Use a mix of letters, numbers and symbols for a stronger password.
                </p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  width: '100%', backgroundColor: 'var(--color-terra)',
                  color: '#f6eddc', border: 'none', padding: '16px',
                  fontSize: '13px', letterSpacing: '2px', fontWeight: '700',
                  textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer',
                  borderRadius: '8px', opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{
                width: '64px', height: '64px', backgroundColor: 'var(--color-terra)',
                borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 24px',
                fontSize: '28px', fontWeight: '700', color: '#f6eddc'
              }}>
                &#10003;
              </div>
              <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '12px' }}>
                Password Updated
              </h2>
              <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-terra)', margin: '0 auto 16px' }} />
              <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
                Your password has been updated. Redirecting you to sign in...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="auth-shell" style={{ backgroundColor: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading password reset form...</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
