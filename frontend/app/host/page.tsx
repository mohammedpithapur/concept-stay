'use client'

import { useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import { getHostDashboard, type HostDashboard } from '@/lib/marketplace'
import HostShell, { hostCard, inr } from '@/components/host/HostShell'

export default function HostDashboardPage() {
  const { user, loading } = useRequireAuth({ requireHost: true })
  const { fetchWithAuth } = useAuth()
  const [data, setData] = useState<HostDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    getHostDashboard(fetchWithAuth).then(setData).catch(e => setError((e as Error).message))
  }, [user, fetchWithAuth])

  if (loading || !user) return null

  const stats = data
    ? [
        { label: 'Bookings this month', value: String(data.bookings_this_month) },
        { label: 'Revenue this month', value: inr(data.revenue) },
        { label: 'Occupancy this month', value: `${data.occupancy_percent}%` },
      ]
    : []

  return (
    <HostShell title="Dashboard">
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            {stats.map(s => (
              <div key={s.label} style={hostCard}>
                <p style={{ fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>{s.label}</p>
                <p style={{ fontSize: '32px', fontWeight: 800, marginTop: '6px' }}>{s.value}</p>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>Upcoming bookings</h2>
          {data.upcoming.length === 0 ? (
            <div style={hostCard}><p style={{ color: 'var(--color-text-secondary)' }}>No upcoming bookings yet.</p></div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {data.upcoming.map(b => (
                <div key={b.id} style={{ ...hostCard, display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontWeight: 700 }}>{b.guest_name}</p>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      {b.check_in} → {b.check_out} · {b.nights} night{b.nights === 1 ? '' : 's'} · {b.guests} guest{b.guests === 1 ? '' : 's'}
                    </p>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', alignSelf: 'center' }}>Ref {b.booking_ref}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </HostShell>
  )
}
