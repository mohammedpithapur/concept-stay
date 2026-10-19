'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import { applyToBeHost } from '@/lib/marketplace'
import HostShell, { hostCard, hostPrimaryButton } from '@/components/host/HostShell'

export default function HostApplyPage() {
  const { user, loading } = useRequireAuth()
  const { fetchWithAuth, refreshUser } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading || !user) return null

  const apply = async () => {
    setBusy(true); setError(null)
    try {
      await applyToBeHost(fetchWithAuth)
      await refreshUser()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const status = user.role === 'host' ? user.host_status : null

  return (
    <HostShell title="Become a Concept Stay host">
      <div style={{ ...hostCard, maxWidth: '640px' }}>
        {user.role === 'admin' && <p>You are an admin and can already manage listings from the <Link href="/host">host dashboard</Link>.</p>}

        {status === 'approved' && (
          <p>You are an approved host. <Link href="/host/properties" style={{ fontWeight: 700 }}>Manage your listings</Link>.</p>
        )}
        {status === 'pending' && (
          <>
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Application received</h2>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              Our team is reviewing your host application. You will be able to add listings as soon as it is approved.
            </p>
          </>
        )}
        {status === 'suspended' && (
          <p style={{ color: '#C62828' }}>Your host account is suspended. Please contact support.</p>
        )}

        {user.role === 'guest' && (
          <>
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>List your stay with us</h2>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: '20px' }}>
              Concept Stay is a curated collection. Every listing is reviewed by our team before it goes live, and our
              verified badge is only given after we check the property, photos, location and host.
            </p>
            {error && <p role="alert" style={{ color: '#C62828', marginBottom: '12px', fontSize: '14px' }}>{error}</p>}
            <button onClick={apply} disabled={busy} style={{ ...hostPrimaryButton, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Submitting…' : 'Apply to become a host'}
            </button>
          </>
        )}
      </div>
    </HostShell>
  )
}
