'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  approveGuestId, getHostGuestId, listHostBookings, rejectGuestId, type HostBooking,
} from '@/lib/marketplace'
import HostShell, { hostCard, hostGhostButton, hostInput, hostPrimaryButton, inr } from '@/components/host/HostShell'

const ID_TEXT: Record<string, string> = {
  missing: 'No ID yet', pending: 'ID waiting for your review', approved: 'ID approved', rejected: 'Reported to admin',
}

function BookingRow({ b, onChanged }: { b: HostBooking; onChanged: () => void }) {
  const { fetchWithAuth } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const status = b.guest_id_status ?? 'missing'

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn(); onChanged() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const viewId = () => run(async () => {
    const info = await getHostGuestId(b.id, fetchWithAuth)
    if (info.signed_url) window.open(info.signed_url, '_blank', 'noopener,noreferrer')
  })

  return (
    <div style={hostCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontWeight: 700 }}>{b.guest_name} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>· {b.booking_ref}</span></p>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {b.check_in} to {b.check_out} · {b.nights} night{b.nights === 1 ? '' : 's'} · {b.guests} guest{b.guests === 1 ? '' : 's'} · {inr(b.total)}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{b.status} · {b.payment_status}</p>
        </div>
        <span style={{ alignSelf: 'flex-start', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>{ID_TEXT[status] ?? status}</span>
      </div>
      {error && <p role="alert" style={{ color: '#C62828', fontSize: '13px', marginTop: '8px' }}>{error}</p>}
      {status !== 'missing' && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={hostGhostButton} disabled={busy} onClick={viewId}>View ID</button>
          {status === 'pending' && <button style={hostPrimaryButton} disabled={busy} onClick={() => run(() => approveGuestId(b.id, fetchWithAuth))}>Approve</button>}
          {status !== 'approved' && status !== 'rejected' && !reporting && (
            <button style={hostGhostButton} disabled={busy} onClick={() => setReporting(true)}>Report to admin</button>
          )}
          {reporting && (
            <>
              <input aria-label="Reason" placeholder="Why is this not legitimate?" value={reason} onChange={e => setReason(e.target.value)} style={{ ...hostInput, flex: 1, minWidth: '220px', width: 'auto' }} />
              <button style={{ ...hostPrimaryButton, backgroundColor: '#C62828' }} disabled={busy || !reason.trim()}
                onClick={() => run(async () => { await rejectGuestId(b.id, reason.trim(), fetchWithAuth); setReporting(false); setReason('') })}>
                Send report
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function HostBookingsPage() {
  const { user, loading } = useRequireAuth({ requireHost: true })
  const { fetchWithAuth } = useAuth()
  const [items, setItems] = useState<HostBooking[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    listHostBookings(fetchWithAuth).then(r => setItems(r.items)).catch(e => setError((e as Error).message))
  }, [fetchWithAuth])

  useEffect(() => { if (user) load() }, [user, load])

  if (loading || !user) return null

  return (
    <HostShell title="Bookings">
      {error && <p role="alert" style={{ color: '#C62828' }}>{error}</p>}
      {!items && !error && <p>Loading…</p>}
      {items?.length === 0 && <div style={hostCard}><p>No bookings yet.</p></div>}
      <div style={{ display: 'grid', gap: '12px' }}>
        {items?.map(b => <BookingRow key={b.id} b={b} onChanged={load} />)}
      </div>
    </HostShell>
  )
}
