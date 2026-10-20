'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { AlertTriangle } from 'lucide-react'

/**
 * Google OAuth callback page.
 * Google redirects here with ?code=...&state=<next-url>
 * We send the code to the backend which exchanges it for user info and issues tokens.
 */
export default function GoogleCallbackClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { googleLoginCallback } = useAuth()

  const [error, setError] = useState('')
  const hasAttemptedRef = useRef(false)

  useEffect(() => {
    const code = searchParams.get('code')
    const next = searchParams.get('state') || '/dashboard'
    const errorParam = searchParams.get('error')

    if (errorParam) {
      setError('Google sign-in was cancelled or denied.')
      return
    }

    if (!code) {
      setError('Missing authorization code from Google.')
      return
    }

    if (hasAttemptedRef.current) return
    hasAttemptedRef.current = true

    googleLoginCallback(code)
      .then(user => {
        const target = (user.role === 'admin' && next === '/dashboard') ? '/admin/properties' : next
        window.location.href = target
      })
      .catch(err => {
        setError(err.message || 'Authentication failed. Please try again.')
      })
  }, [searchParams, googleLoginCallback])

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '24px' }}>
        <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '40px', maxWidth: '400px', textAlign: 'center' }}>
          <AlertTriangle size={40} style={{ color: '#d32f2f', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '12px' }}>Sign-In Failed</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '24px' }}>{error}</p>
          <button
            onClick={() => router.replace('/login')}
            style={{ backgroundColor: 'var(--color-terra)', color: '#f6eddc', border: 'none', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '3px solid var(--color-terra)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Completing sign-in with Google...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}