'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  createHostBlock, deleteHostBlock, getHostCalendar, listHostProperties,
  type CalendarEvent, type HostProperty,
} from '@/lib/marketplace'
import HostShell, { hostCard, hostGhostButton, hostInput, hostPrimaryButton } from '@/components/host/HostShell'

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type DayState = 'available' | 'booked' | 'blocked'

const COLORS: Record<DayState, { bg: string; fg: string; label: string }> = {
  available: { bg: '#E8F5E9', fg: '#1B5E20', label: 'Available' },
  booked: { bg: '#FFEBEE', fg: '#B71C1C', label: 'Booked' },
  blocked: { bg: '#424242', fg: '#ffffff', label: 'Blocked' },
}

export default function HostCalendarPage() {
  const { user, loading } = useRequireAuth({ requireHost: true })
  const { fetchWithAuth } = useAuth()
  const [properties, setProperties] = useState<HostProperty[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [blockForm, setBlockForm] = useState({ check_in: '', check_out: '', note: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    listHostProperties(fetchWithAuth)
      .then(list => { setProperties(list); if (list[0]) setPropertyId(prev => prev || list[0].id) })
      .catch(e => setError((e as Error).message))
  }, [user, fetchWithAuth])

  const load = useCallback(() => {
    if (!propertyId) return
    const from = iso(new Date(month.getFullYear(), month.getMonth(), 1))
    const to = iso(new Date(month.getFullYear(), month.getMonth() + 1, 1))
    getHostCalendar(propertyId, from, to, fetchWithAuth)
      .then(res => setEvents(res.events))
      .catch(e => setError((e as Error).message))
  }, [propertyId, month, fetchWithAuth])

  useEffect(load, [load])

  const dayStates = useMemo(() => {
    const map = new Map<string, DayState>()
    for (const ev of events) {
      const state: DayState = ev.type === 'admin_block' ? 'blocked' : 'booked'
      for (let d = new Date(ev.check_in + 'T00:00:00'); iso(d) < ev.check_out; d.setDate(d.getDate() + 1)) {
        const key = iso(d)
        if (map.get(key) !== 'booked') map.set(key, state) // a real booking wins over a block
      }
    }
    return map
  }, [events])

  if (loading || !user) return null

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const leading = month.getDay()
  const cells: (string | null)[] = [
    ...Array(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ]

  const addBlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await createHostBlock(propertyId, { ...blockForm, note: blockForm.note || undefined }, fetchWithAuth)
      setBlockForm({ check_in: '', check_out: '', note: '' })
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const removeBlock = async (id: string) => {
    setError(null)
    try { await deleteHostBlock(propertyId, id, fetchWithAuth); load() } catch (err) { setError((err as Error).message) }
  }

  const blocks = events.filter(e => e.type === 'admin_block')

  return (
    <HostShell title="Calendar">
      {error && <p role="alert" style={{ color: '#C62828', marginBottom: '12px' }}>{error}</p>}
      {properties.length === 0 ? (
        <div style={hostCard}><p>Add a listing first to manage its calendar.</p></div>
      ) : (
        <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          <div style={hostCard}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <select value={propertyId} onChange={e => setPropertyId(e.target.value)} style={{ ...hostInput, flex: 1, minWidth: '180px' }}>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button style={hostGhostButton} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
              <strong style={{ minWidth: '130px', textAlign: 'center' }}>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
              <button style={hostGhostButton} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>{d}</div>
              ))}
              {cells.map((key, i) => {
                if (!key) return <div key={`b${i}`} />
                const state = dayStates.get(key) ?? 'available'
                const c = COLORS[state]
                return (
                  <div key={key} title={`${key}: ${c.label}`}
                    style={{ textAlign: 'center', padding: '10px 0', borderRadius: '6px', fontSize: '13px', fontWeight: 600, backgroundColor: c.bg, color: c.fg }}>
                    {Number(key.slice(8))}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '14px', marginTop: '14px', flexWrap: 'wrap' }}>
              {(Object.keys(COLORS) as DayState[]).map(s => (
                <span key={s} style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: COLORS[s].bg, border: `1px solid ${COLORS[s].fg}` }} />
                  {COLORS[s].label}
                </span>
              ))}
            </div>
          </div>

          <div style={hostCard}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>Block dates</h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
              Use this for personal use, maintenance or bookings made elsewhere. Check-out day is free for the next guest.
            </p>
            <form onSubmit={addBlock} style={{ display: 'grid', gap: '10px' }}>
              <input required type="date" aria-label="Block from" value={blockForm.check_in} style={hostInput}
                onChange={e => setBlockForm({ ...blockForm, check_in: e.target.value })} />
              <input required type="date" aria-label="Block until" min={blockForm.check_in} value={blockForm.check_out} style={hostInput}
                onChange={e => setBlockForm({ ...blockForm, check_out: e.target.value })} />
              <input placeholder="Reason (optional)" value={blockForm.note} style={hostInput}
                onChange={e => setBlockForm({ ...blockForm, note: e.target.value })} />
              <button type="submit" disabled={busy} style={{ ...hostPrimaryButton, opacity: busy ? 0.6 : 1 }}>Block dates</button>
            </form>

            {blocks.length > 0 && (
              <ul style={{ listStyle: 'none', marginTop: '18px', display: 'grid', gap: '8px' }}>
                {blocks.map(b => (
                  <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', gap: '8px' }}>
                    <span>{b.check_in} → {b.check_out}{b.note ? ` · ${b.note}` : ''}</span>
                    <button onClick={() => removeBlock(b.id)} style={{ border: 'none', background: 'none', color: '#C62828', cursor: 'pointer', fontWeight: 700 }}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </HostShell>
  )
}
