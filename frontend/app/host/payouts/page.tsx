'use client'

import { useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import { listHostPayouts, type Payout } from '@/lib/marketplace'
import HostShell, { hostCard, inr } from '@/components/host/HostShell'

const STATUS: Record<Payout['status'], { bg: string; color: string; text: string }> = {
  owed: { bg: '#FFF8E7', color: '#E65100', text: 'Owed to you' },
  paid: { bg: '#E8F5E9', color: '#2E7D32', text: 'Paid' },
  voided: { bg: '#EEEEEE', color: '#555555', text: 'Voided' },
}

export default function HostPayoutsPage() {
  const { user, loading } = useRequireAuth({ requireHost: true })
  const { fetchWithAuth } = useAuth()
  const [payouts, setPayouts] = useState<Payout[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    listHostPayouts(fetchWithAuth).then(setPayouts).catch(e => setError((e as Error).message))
  }, [user, fetchWithAuth])

  if (loading || !user) return null

  const owed = (payouts ?? []).filter(p => p.status === 'owed').reduce((sum, p) => sum + p.host_amount, 0)

  return (
    <HostShell title="Payouts">
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!payouts && !error && <p>Loading…</p>}
      {payouts && (
        <>
          <div style={{ ...hostCard, marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Owed to you</p>
            <p style={{ fontSize: '32px', fontWeight: 800 }}>{inr(owed)}</p>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Concept Stay pays hosts after the stay. Each payout shows how the booking was split.</p>
          </div>
          {payouts.length === 0 ? (
            <div style={hostCard}><p>No payouts yet.</p></div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {payouts.map(p => (
                <div key={p.id} style={{ ...hostCard, display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: '20px', fontWeight: 800 }}>{inr(p.host_amount)}</p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      Guest paid {inr(p.gross_amount)} · commission {inr(p.commission)} · service fee {inr(p.fees)} · taxes {inr(p.taxes)}
                    </p>
                    {p.reference && <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Reference: {p.reference}</p>}
                  </div>
                  <span style={{ alignSelf: 'center', backgroundColor: STATUS[p.status].bg, color: STATUS[p.status].color, padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                    {STATUS[p.status].text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </HostShell>
  )
}
