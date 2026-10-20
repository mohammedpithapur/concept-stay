'use client'
import { useState } from 'react'
import Link from 'next/link'
import { API_BASE } from '@/lib/auth/AuthContext'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Email is required'); return }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email'); return }
    setError('')
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || 'Unable to send reset link')
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell" style={{ backgroundColor: 'var(--color-bg-soft)' }}>
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <h1 style={{ color: 'var(--color-text-primary)', fontSize: '28px', letterSpacing: '3px', marginBottom: '8px', fontWeight: '800' }}>
              CONCEPT STAY
            </h1>
          </Link>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Reset your password</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: 'clamp(24px, 4vw, 40px)' }}>
          {!submitted ? (
            <>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                Forgot Password
              </h2>
              <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', marginBottom: '16px' }} />
              <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '28px', lineHeight: '1.6' }}>
                Enter the email address associated with your account and we will send you a link to reset your password.
              </p>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  style={{
                    width: '100%', padding: '14px 16px',
                    border: `1px solid ${error ? '#E53E3E' : 'var(--color-border)'}`,
                    borderRadius: '8px', fontSize: '14px', color: 'var(--color-text-primary)',
                    outline: 'none', backgroundColor: '#ffffff',
                    boxSizing: 'border-box', fontFamily: 'inherit'
                  }}
                />
                {error && <p style={{ color: '#E53E3E', fontSize: '12px', marginTop: '4px' }}>{error}</p>}
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  width: '100%', backgroundColor: 'var(--color-brand)',
                  color: 'var(--color-on-accent)', border: 'none', padding: '16px',
                  fontSize: '13px', letterSpacing: '2px', fontWeight: '700',
                  textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '24px', borderRadius: '8px', opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--color-text-muted)' }}>
                Remember your password?{' '}
                <Link href="/login" style={{ color: 'var(--color-terra)', textDecoration: 'none', fontWeight: '700' }}>
                  Sign In
                </Link>
              </p>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{
                width: '64px', height: '64px', backgroundColor: 'var(--color-brand)',
                borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 24px',
                fontSize: '28px', fontWeight: '700', color: 'var(--color-on-accent)'
              }}>
                &#10003;
              </div>
              <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '12px' }}>
                Check Your Email
              </h2>
              <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', margin: '0 auto 16px' }} />
              <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7', marginBottom: '28px' }}>
                If an account exists for <strong>{email}</strong>, a password reset link has been sent.
              </p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
                Didn&apos;t receive it? Check your spam folder or{' '}
                <button
                  onClick={() => setSubmitted(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-terra)', cursor: 'pointer', fontWeight: '700', fontSize: '13px', fontFamily: 'inherit' }}
                >
                  try again
                </button>
              </p>
              <Link
                href="/login"
                style={{
                  display: 'inline-block', backgroundColor: 'var(--color-brand)',
                  color: 'var(--color-on-accent)', padding: '14px 32px', fontSize: '13px',
                  letterSpacing: '1.5px', fontWeight: '700', textTransform: 'uppercase',
                  textDecoration: 'none', borderRadius: '8px'
                }}
              >
                Back to Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
