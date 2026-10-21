'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mail, Phone } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  listConnections, removeConnection, respondConnection, setOpenToConnections,
  type ConnectionsData,
} from '@/lib/marketplace'

const card = { backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '24px', marginBottom: '16px' } as const
const small = { padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' } as const

/** Opt in or out of being visible to other guests. Off by default. */
export function VisibilityToggle() {
  const { user, fetchWithAuth, refreshUser } = useAuth()
  const [on, setOn] = useState<boolean>(Boolean((user as { open_to_connections?: boolean } | null)?.open_to_connections))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    setBusy(true); setError(null)
    try {
      const saved = await setOpenToConnections(!on, fetchWithAuth)
      setOn(saved.open_to_connections)
      void refreshUser()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div style={card}>
      <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>Travel buddies</h3>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
        Other guests staying at the same place can see your first name and dates. Contact details are shared only after you accept a request.
      </p>
      <label style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
        <input type="checkbox" role="switch" aria-label="Let other guests see me" checked={on} disabled={busy} onChange={toggle} />
        {on ? 'Visible to guests at the same stay' : 'Hidden: turned off'}
      </label>
      {error && <p role="alert" style={{ color: '#C62828', fontSize: '13px', marginTop: '8px' }}>{error}</p>}
    </div>
  )
}

/** Incoming requests, requests sent, and connected guests with their contact details. */
export default function TravelBuddies() {
  const { fetchWithAuth } = useAuth()
  const [data, setData] = useState<ConnectionsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    listConnections(fetchWithAuth).then(setData).catch(e => setError((e as Error).message))
  }, [fetchWithAuth])

  useEffect(load, [load])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn(); load() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <VisibilityToggle />
      {error && <p role="alert" style={{ color: '#C62828', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}

      <div style={card}>
        <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '12px' }}>Requests for you</h3>
        {data?.incoming.length === 0 && <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>No requests right now.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '12px' }}>
          {data?.incoming.map(r => (
            <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '14px' }}><strong>{r.first_name}</strong> stayed at {r.property_name}</span>
              <span style={{ display: 'flex', gap: '8px' }}>
                <button disabled={busy} onClick={() => run(() => respondConnection(r.id, 'accept', fetchWithAuth))}
                  style={{ ...small, border: 'none', backgroundColor: 'var(--color-brand)', color: 'var(--color-on-accent)' }}>Accept</button>
                <button disabled={busy} onClick={() => run(() => respondConnection(r.id, 'decline', fetchWithAuth))}
                  style={{ ...small, border: '1px solid var(--color-border)', backgroundColor: '#ffffff' }}>Decline</button>
                <button disabled={busy} onClick={() => run(() => respondConnection(r.id, 'block', fetchWithAuth))}
                  style={{ ...small, border: '1px solid #C62828', backgroundColor: '#ffffff', color: '#C62828' }}>Block</button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {(data?.outgoing.length ?? 0) > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '12px' }}>Requests you sent</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '10px' }}>
            {data?.outgoing.map(r => (
              <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', fontSize: '14px' }}>
                <span>Waiting for <strong>{r.first_name}</strong></span>
                <button disabled={busy} onClick={() => run(() => removeConnection(r.id, fetchWithAuth))}
                  style={{ ...small, border: '1px solid var(--color-border)', backgroundColor: '#ffffff' }}>Withdraw</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '12px' }}>Connected</h3>
        {data?.connected.length === 0 && <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>No connections yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '14px' }}>
          {data?.connected.map(c => (
            <li key={c.id}>
              <p style={{ fontWeight: 700 }}>{c.full_name} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>· {c.property_name}</span></p>
              <p style={{ fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}><Mail size={14} /> {c.email}</p>
              {c.phone && <p style={{ fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}><Phone size={14} /> {c.phone}</p>}
              <button disabled={busy} onClick={() => run(() => removeConnection(c.id, fetchWithAuth))}
                style={{ ...small, marginTop: '6px', border: '1px solid var(--color-border)', backgroundColor: '#ffffff' }}>Disconnect</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
