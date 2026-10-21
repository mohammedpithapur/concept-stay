'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import { getCoGuests, sendConnectionRequest, type CoGuest } from '@/lib/marketplace'

const STATUS_TEXT: Record<string, string> = {
  pending_out: 'Request sent', pending_in: 'Wants to connect: see Travel buddies', accepted: 'Connected',
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** Other opted-in guests around the same stay. Shows first names only; contact details come after they accept. */
export default function CoGuests({ bookingId }: { bookingId: string }) {
  const { fetchWithAuth } = useAuth()
  const [guests, setGuests] = useState<CoGuest[] | null>(null)
  const [off, setOff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    getCoGuests(bookingId, fetchWithAuth)
      .then(g => { setGuests(g); setOff(false) })
      .catch(e => {
        const message = (e as Error).message
        if (/travel buddies/i.test(message)) setOff(true)
        else setError(message)
      })
  }, [bookingId, fetchWithAuth])

  useEffect(load, [load])

  const request = async (guest: CoGuest) => {
    setBusy(guest.user_id); setError(null)
    try { await sendConnectionRequest(guest.user_id, bookingId, fetchWithAuth); load() }
    catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <div style={{ marginTop: '14px', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Users size={16} style={{ color: 'var(--color-terra)' }} />
        <strong style={{ fontSize: '13px' }}>Travel buddies</strong>
      </div>
      {off && (
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
          Turn on travel buddies in My Profile to see other guests staying around the same time.
        </p>
      )}
      {error && <p role="alert" style={{ fontSize: '12px', color: '#C62828', marginTop: '6px' }}>{error}</p>}
      {guests && guests.length === 0 && (
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
          No other guests have chosen to be visible for this stay yet.
        </p>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: '8px' }}>
        {guests?.map(g => (
          <li key={g.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', fontSize: '13px', flexWrap: 'wrap' }}>
            <span><strong>{g.first_name}</strong> · {fmt(g.check_in)} to {fmt(g.check_out)}</span>
            {g.connection_status === 'none' ? (
              <button type="button" disabled={busy === g.user_id} onClick={() => request(g)}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--color-terra)', backgroundColor: '#ffffff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                Request to connect
              </button>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{STATUS_TEXT[g.connection_status] ?? ''}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
