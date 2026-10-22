'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useRequireAuth } from '@/lib/auth/useRequireAuth'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  addSlot, deleteSlot, formatStart, istToIso, listOperatorExperiences, listOperatorSlots, updateSlot,
  type OperatorExperience, type OperatorSlot,
} from '@/lib/experiences'
import OperatorShell from '@/components/operator/OperatorShell'
import { hostCard, hostGhostButton, hostInput, hostPrimaryButton } from '@/components/host/HostShell'

const label = { display: 'grid', gap: '6px', fontSize: '13px', fontWeight: 600 } as const

export default function OperatorSlotsPage() {
  const { user, loading } = useRequireAuth({ requireOperator: true })
  const { fetchWithAuth } = useAuth()
  const [experiences, setExperiences] = useState<OperatorExperience[] | null>(null)
  const [selected, setSelected] = useState('')
  const [slots, setSlots] = useState<OperatorSlot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [seats, setSeats] = useState(4)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ id: string; capacity: number } | null>(null)

  useEffect(() => {
    if (!user) return
    listOperatorExperiences(fetchWithAuth)
      .then(list => { setExperiences(list); setSelected(s => s || list[0]?.id || '') })
      .catch(e => setError((e as Error).message))
  }, [user, fetchWithAuth])

  const loadSlots = useCallback(() => {
    if (!selected) return
    listOperatorSlots(selected, fetchWithAuth).then(setSlots).catch(e => setError((e as Error).message))
  }, [selected, fetchWithAuth])

  useEffect(loadSlots, [loadSlots])

  if (loading || !user) return null

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await work(); loadSlots() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    void run(() => addSlot(selected, { starts_at: istToIso(date, time), capacity: seats }, fetchWithAuth))
  }

  return (
    <OperatorShell title="Slots">
      {error && <p role="alert" style={{ color: '#C62828', marginBottom: '12px' }}>{error}</p>}
      {experiences && experiences.length === 0 && (
        <div style={hostCard}><p>Add an experience first, then open dates for it here.</p></div>
      )}
      {experiences && experiences.length > 0 && (
        <div style={{ display: 'grid', gap: '20px' }}>
          <label style={{ ...label, maxWidth: '420px' }}>Experience
            <select style={hostInput} value={selected} onChange={e => { setSlots(null); setSelected(e.target.value) }}>
              {experiences.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </label>

          <form onSubmit={add} style={{ ...hostCard, display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={label}>Date
              <input style={hostInput} type="date" required value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label style={label}>Start time (India time)
              <input style={hostInput} type="time" required value={time} onChange={e => setTime(e.target.value)} />
            </label>
            <label style={label}>Seats
              <input style={{ ...hostInput, width: '100px' }} type="number" min={1} max={500} required value={seats} onChange={e => setSeats(Number(e.target.value))} />
            </label>
            <button type="submit" disabled={busy || !date} style={{ ...hostPrimaryButton, opacity: busy ? 0.6 : 1 }}>Add slot</button>
          </form>

          {!slots && !error && <p>Loading…</p>}
          {slots && slots.length === 0 && <div style={hostCard}><p>No slots yet for this experience.</p></div>}
          <div style={{ display: 'grid', gap: '10px' }}>
            {slots?.map(s => (
              <div key={s.id} style={{ ...hostCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontWeight: 700 }}>{formatStart(s.starts_at)}</p>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{s.seats_booked} of {s.capacity} seats booked</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {editing?.id === s.id ? (
                    <>
                      <input aria-label="New seat count" style={{ ...hostInput, width: '90px' }} type="number" min={Math.max(1, s.seats_booked)} max={500}
                        value={editing.capacity} onChange={e => setEditing({ id: s.id, capacity: Number(e.target.value) })} />
                      <button type="button" style={hostPrimaryButton} disabled={busy}
                        onClick={() => void run(async () => { await updateSlot(selected, s.id, editing.capacity, fetchWithAuth); setEditing(null) })}>Save</button>
                      <button type="button" style={hostGhostButton} onClick={() => setEditing(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" style={hostGhostButton} onClick={() => setEditing({ id: s.id, capacity: s.capacity })}>Change seats</button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete slot ${formatStart(s.starts_at)}`}
                    title={s.seats_booked > 0 ? 'This slot has bookings and cannot be deleted' : 'Delete slot'}
                    disabled={busy || s.seats_booked > 0}
                    onClick={() => void run(() => deleteSlot(selected, s.id, fetchWithAuth))}
                    style={{ background: 'none', border: 'none', cursor: s.seats_booked > 0 ? 'not-allowed' : 'pointer', color: s.seats_booked > 0 ? '#9E9E9E' : '#C62828' }}
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </OperatorShell>
  )
}
