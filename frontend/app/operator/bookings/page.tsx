'use client'

import { useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import { formatStart, listOperatorBookings, type OperatorBooking } from '@/lib/experiences'
import OperatorShell from '@/components/operator/OperatorShell'
import { hostCard } from '@/components/host/HostShell'

const cell = { padding: '10px 12px', textAlign: 'left' as const, fontSize: '14px', borderBottom: '1px solid var(--color-border)' }

export default function OperatorBookingsPage() {
  const { user, loading } = useRequireAuth({ requireOperator: true })
  const { fetchWithAuth } = useAuth()
  const [rows, setRows] = useState<OperatorBooking[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    listOperatorBookings(fetchWithAuth).then(setRows).catch(e => setError((e as Error).message))
  }, [user, fetchWithAuth])

  if (loading || !user) return null

  return (
    <OperatorShell title="Bookings">
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!rows && !error && <p>Loading…</p>}
      {rows && rows.length === 0 && <div style={hostCard}><p>No paid bookings yet.</p></div>}
      {rows && rows.length > 0 && (
        <div style={{ ...hostCard, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Experience', 'When', 'People', 'Guest', 'Phone', 'Voucher', 'Status'].map(h => (
                  <th key={h} style={{ ...cell, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={cell}>{r.experience_title}</td>
                  <td style={cell}>{formatStart(r.starts_at)}</td>
                  <td style={cell}>{r.party_size}</td>
                  <td style={cell}>{r.guest_first_name}</td>
                  <td style={cell}>{r.guest_phone ?? 'Not given'}</td>
                  <td style={{ ...cell, fontWeight: 700, letterSpacing: '1px' }}>{r.voucher_code}</td>
                  <td style={cell}>{r.status === 'completed' ? 'Completed' : 'Confirmed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </OperatorShell>
  )
}
