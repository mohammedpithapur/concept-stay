'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { API_BASE } from '@/lib/api'
import { AlertTriangle } from 'lucide-react'

/**
 * Google OAuth callback page.
 * Google redirects here with ?code=...&state=<next-url>
 * We send the code to the backend which exchanges it for user info and issues tokens.
 */
export default function GoogleCallbackClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [error, setError] = useState('')

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

    fetch(`${API_BASE}/auth/google/callback?code=${encodeURIComponent(code)}`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Google authentication failed')
        }

        router.replace(next)
      })
      .catch(err => {
        setError(err.message || 'Authentication failed. Please try again.')
      })
  }, [searchParams, router])

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '24px' }}>
        <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '40px', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <AlertTriangle size={44} style={{ color: '#E53E3E' }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '12px' }}>Sign-In Failed</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '24px' }}>{error}</p>
          <button
            onClick={() => router.replace('/login')}
            style={{ backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)', border: 'none', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}
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
