'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import { applyToBeOperator } from '@/lib/experiences'
import OperatorShell from '@/components/operator/OperatorShell'
import { hostCard, hostPrimaryButton } from '@/components/host/HostShell'

export default function OperatorApplyPage() {
  const { user, loading } = useRequireAuth()
  const { fetchWithAuth, refreshUser } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading || !user) return null

  const apply = async () => {
    setBusy(true); setError(null)
    try {
      await applyToBeOperator(fetchWithAuth)
      await refreshUser()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const status = user.role === 'operator' ? user.operator_status : null

  return (
    <OperatorShell title="Become a Concept Stay operator">
      <div style={{ ...hostCard, maxWidth: '640px' }}>
        {user.role === 'admin' && <p>You are an admin and can already manage experiences from the <Link href="/operator">operator dashboard</Link>.</p>}
        {user.role === 'host' && (
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            Your account is a host account, and one account cannot be both a host and an operator. To offer experiences, register a separate account with another email.
          </p>
        )}

        {status === 'approved' && (
          <p>You are an approved operator. <Link href="/operator/experiences" style={{ fontWeight: 700 }}>Manage your experiences</Link>.</p>
        )}
        {status === 'pending' && (
          <>
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Application received</h2>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              Our team is reviewing your application. You can complete your <Link href="/operator/profile" style={{ fontWeight: 700 }}>profile</Link> now so payouts are ready, and you can add experiences as soon as you are approved.
            </p>
          </>
        )}
        {status === 'suspended' && <p style={{ color: '#C62828' }}>Your operator account is suspended. Please contact support.</p>}

        {user.role === 'guest' && (
          <>
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Offer an experience</h2>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: '20px' }}>
              Local activities, food walks, wellness sessions and transport led by trusted locals. Every operator and every listing is
              reviewed by our team. Guests book an open date and pay up front, so there is nothing to accept or decline.
            </p>
            {error && <p role="alert" style={{ color: '#C62828', marginBottom: '12px', fontSize: '14px' }}>{error}</p>}
            <button onClick={apply} disabled={busy} style={{ ...hostPrimaryButton, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Submitting…' : 'Apply to become an operator'}
            </button>
          </>
        )}
      </div>
    </OperatorShell>
  )
}
